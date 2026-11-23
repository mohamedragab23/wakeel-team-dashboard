import postgres from 'postgres';
import { gzipSync, gunzipSync } from 'node:zlib';

let client: ReturnType<typeof postgres> | undefined;
let ready: Promise<unknown> | undefined;
const MAX_OBJECT = 16 * 1024 * 1024;
const MAX_STORE = 128 * 1024 * 1024;

function db() {
  if (!client) {
    const url = process.env.POSTGRES_URL?.trim();
    if (!url) throw new Error('POSTGRES_URL is required for private object storage');
    client = postgres(url, { max: 2, prepare: false, connect_timeout: 15, idle_timeout: 10 });
  }
  return client;
}

async function init() {
  if (!ready) ready = db()`CREATE TABLE IF NOT EXISTS public.wakeel_private_objects (
    object_key text PRIMARY KEY, body bytea NOT NULL, mime_type text NOT NULL,
    compressed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
  )`.catch(error => { ready = undefined; throw error; });
  await ready;
}

function valid(key: string) {
  if (!/^(attachments|backups)\//.test(key) || key.length > 1024 || key.includes('..')) {
    throw new Error('Invalid private object key');
  }
}

export async function putPrivateObject(key: string, input: Buffer, mimeType: string, compress = false) {
  valid(key);
  if (input.length > MAX_OBJECT) throw new Error('File exceeds the 16 MB storage limit');
  const body = compress ? gzipSync(input) : input;
  await init();
  await db().begin(async sql => {
    // Serialize the quota check with writes across all serverless instances.
    await sql`SELECT pg_advisory_xact_lock(87164219)`;
    const usage = await sql`SELECT COALESCE(sum(octet_length(body)), 0)::text AS bytes
      FROM public.wakeel_private_objects WHERE object_key <> ${key}`;
    if (Number(usage[0].bytes) + body.length > MAX_STORE) {
      throw new Error('Private storage is full; export older backups before uploading more');
    }
    await sql`INSERT INTO public.wakeel_private_objects (object_key, body, mime_type, compressed)
      VALUES (${key}, ${body}, ${mimeType}, ${compress})
      ON CONFLICT (object_key) DO UPDATE SET body = EXCLUDED.body,
        mime_type = EXCLUDED.mime_type, compressed = EXCLUDED.compressed`;
  });
}

export async function getPrivateObject(key: string) {
  valid(key); await init();
  const rows = await db()`SELECT body, mime_type, compressed FROM public.wakeel_private_objects WHERE object_key = ${key}`;
  if (!rows.length) return null;
  const buffer = rows[0].compressed ? gunzipSync(rows[0].body, { maxOutputLength: MAX_OBJECT }) : Buffer.from(rows[0].body);
  return { buffer, mimeType: String(rows[0].mime_type), sizeBytes: buffer.length };
}

export async function deletePrivateObject(key: string) {
  valid(key); await init();
  await db()`DELETE FROM public.wakeel_private_objects WHERE object_key = ${key}`;
}

export async function listPrivateAttachments() {
  await init();
  const rows = await db()`SELECT object_key, octet_length(body)::int AS bytes, created_at
    FROM public.wakeel_private_objects WHERE object_key LIKE 'attachments/%' ORDER BY object_key`;
  return rows.map(row => ({ key: String(row.object_key), size: Number(row.bytes), lastModified: new Date(row.created_at).toISOString() }));
}
