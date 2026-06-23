import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getMirrorDatabaseUrl, isMirrorDbConfigured } from '@/lib/mirror/config';

let sql: ReturnType<typeof postgres> | null = null;

export function getMirrorSql(): ReturnType<typeof postgres> {
  const url = getMirrorDatabaseUrl();
  if (!url) {
    throw new Error('MIRROR_DATABASE_URL or POSTGRES_URL is not configured');
  }
  if (!sql) {
    sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return sql;
}

export { isMirrorDbConfigured };

export async function runMirrorMigrations(): Promise<void> {
  const db = getMirrorSql();
  const schemaPath = join(process.cwd(), 'lib', 'mirror', 'db', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  await db.unsafe(schema);
}

export async function closeMirrorDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
}
