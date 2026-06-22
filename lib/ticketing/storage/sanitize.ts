import { randomUUID } from 'crypto';
import { extname } from 'path';
import { ALLOWED_ATTACHMENT_MIME, MAX_ATTACHMENT_BYTES } from '@/lib/ticketing/types';

const SAFE_NAME = /[^a-zA-Z0-9._-]/g;

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '').replace(SAFE_NAME, '_').slice(0, 200);
  return base || 'file';
}

export function validateUpload(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return 'ملف فارغ';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'الحد الأقصى 20 ميجابايت لكل ملف';
  const mime = file.type.toLowerCase() || guessMime(file.name);
  if (!ALLOWED_ATTACHMENT_MIME.has(mime)) {
    return 'نوع الملف غير مسموح (PDF, PNG, JPG فقط)';
  }
  const ext = extname(file.name).toLowerCase();
  if (!['.pdf', '.png', '.jpg', '.jpeg'].includes(ext)) {
    return 'امتداد الملف غير مسموح';
  }
  return null;
}

function guessMime(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return '';
}

export function buildStorageKey(ticketId: string, originalName: string): string {
  const safe = sanitizeFilename(originalName);
  return `tickets/${ticketId}/${randomUUID()}_${safe}`;
}
