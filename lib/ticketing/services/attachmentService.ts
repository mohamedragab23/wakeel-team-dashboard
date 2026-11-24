import { getTicketingSql } from '@/lib/ticketing/db/client';
import { getTicketingStorage } from '@/lib/ticketing/storage';
import { buildStorageKey, sanitizeFilename, validateUpload } from '@/lib/ticketing/storage/sanitize';
import type { TicketAttachmentMeta } from '@/lib/ticketing/types';

export type TicketUpload = { name: string; type: string; size: number; buffer: Buffer };
type AttachmentInput = {
  ticketId: string;
  commentId?: string | null;
  file: TicketUpload;
  uploadedByCode: string;
};
type AttachmentSql = ReturnType<typeof getTicketingSql> | import('postgres').TransactionSql;

export async function stageTicketAttachment(input: AttachmentInput) {
  const err = validateUpload(input.file);
  if (err) throw new Error(err);

  const storageKey = buildStorageKey(input.ticketId, input.file.name);
  const storage = getTicketingStorage();
  await storage.put(storageKey, input.file.buffer, input.file.type);

  return {
    async insert(sql: AttachmentSql): Promise<TicketAttachmentMeta> {
      const [row] = await sql<TicketAttachmentMeta[]>`
        INSERT INTO ticket_attachments (
          ticket_id, comment_id, storage_key, original_name, mime_type, size_bytes, uploaded_by_code
        ) VALUES (
          ${input.ticketId}::uuid,
          ${input.commentId ?? null}::uuid,
          ${storageKey},
          ${sanitizeFilename(input.file.name)},
          ${input.file.type},
          ${input.file.size},
          ${input.uploadedByCode}
        )
        RETURNING
          id::text,
          ticket_id::text AS "ticketId",
          comment_id::text AS "commentId",
          original_name AS "originalName",
          mime_type AS "mimeType",
          size_bytes::text AS "sizeBytes",
          uploaded_by_code AS "uploadedByCode",
          created_at::text AS "createdAt"
      `;
      return { ...row, sizeBytes: Number(row.sizeBytes) };
    },
    async discard() {
      try {
        await storage.delete(storageKey);
      } catch (error) {
        console.error('[ticketing] Failed to discard staged attachment', error);
      }
    },
  };
}

export async function saveTicketAttachment(input: AttachmentInput): Promise<TicketAttachmentMeta> {
  const staged = await stageTicketAttachment(input);
  try {
    return await staged.insert(getTicketingSql());
  } catch (error) {
    await staged.discard();
    throw error;
  }
}

export async function listTicketAttachments(ticketId: string): Promise<TicketAttachmentMeta[]> {
  const sql = getTicketingSql();
  const rows = await sql`
    SELECT
      id::text,
      ticket_id::text AS "ticketId",
      comment_id::text AS "commentId",
      original_name AS "originalName",
      mime_type AS "mimeType",
      size_bytes AS "sizeBytes",
      uploaded_by_code AS "uploadedByCode",
      created_at::text AS "createdAt"
    FROM ticket_attachments
    WHERE ticket_id = ${ticketId}::uuid
    ORDER BY created_at ASC
  `;
  return rows as unknown as TicketAttachmentMeta[];
}

export async function getAttachmentById(id: string): Promise<
  (TicketAttachmentMeta & { storageKey: string }) | null
> {
  const sql = getTicketingSql();
  const [row] = await sql`
    SELECT
      id::text,
      ticket_id::text AS "ticketId",
      comment_id::text AS "commentId",
      storage_key AS "storageKey",
      original_name AS "originalName",
      mime_type AS "mimeType",
      size_bytes AS "sizeBytes",
      uploaded_by_code AS "uploadedByCode",
      created_at::text AS "createdAt"
    FROM ticket_attachments
    WHERE id = ${id}::uuid
  `;
  if (!row) return null;
  return {
    ...(row as TicketAttachmentMeta & { storageKey: string }),
    sizeBytes: Number((row as { sizeBytes: number }).sizeBytes),
  };
}

export async function readAttachmentBytes(id: string): Promise<{
  meta: TicketAttachmentMeta & { storageKey: string };
  buffer: Buffer;
} | null> {
  const meta = await getAttachmentById(id);
  if (!meta) return null;
  const storage = getTicketingStorage();
  const file = await storage.get(meta.storageKey);
  if (!file) return null;
  return { meta, buffer: file.buffer };
}
