import { randomBytes } from 'crypto';
import { appendToSheet, ensureSheetExists, getSheetData } from './googleSheets';
import { SHEET_EQUIPMENT_PHOTOS } from './equipmentSheetConstants';
import { appendPhotoSignatureToUrl } from './photoAccess';

const PHOTO_STORE_HEADERS = ['معرف_الصورة', 'رقم_الجزء', 'البيانات'];
/** أقل من حد خلية Google Sheets (~50k) مع هامش */
const CHUNK_SIZE = 40000;
const MAX_PAYLOAD_CHARS = 7_000_000;

/** عنوان الإنتاج — روابط صور التسليم في Google Sheets */
export const PRODUCTION_APP_URL = 'https://wakeel-team-dashboard.vercel.app';

function getAppBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production') {
    return PRODUCTION_APP_URL;
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return 'http://127.0.0.1:3000';
}

export function isPhotoUrl(value: string): boolean {
  const v = value.trim();
  return v.startsWith('http://') || v.startsWith('https://');
}

function normalizePhotoPayload(photoData: string): string {
  const trimmed = photoData.trim();
  if (!trimmed) return '';
  if (isPhotoUrl(trimmed)) return trimmed;
  if (trimmed.startsWith('data:')) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

function splitIntoChunks(payload: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
    chunks.push(payload.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

function parseStoredPayload(payload: string): { mimeType: string; buffer: Buffer } | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    try {
      return {
        mimeType: match[1] || 'image/jpeg',
        buffer: Buffer.from(match[2], 'base64'),
      };
    } catch {
      return null;
    }
  }

  try {
    return {
      mimeType: 'image/jpeg',
      buffer: Buffer.from(trimmed, 'base64'),
    };
  } catch {
    return null;
  }
}

async function ensurePhotoStoreSheet(): Promise<void> {
  await ensureSheetExists(SHEET_EQUIPMENT_PHOTOS, [...PHOTO_STORE_HEADERS]);
}

/**
 * حفظ صورة في شيت المعدات وإرجاع رابط API مع توقيع — لا يحتاج Google Drive.
 */
export async function saveEquipmentPhotoAndGetUrl(
  photoData: string,
  _meta: { supervisorCode: string; riderCode: string }
): Promise<string> {
  const existing = photoData.trim();
  if (!existing) return '';
  if (isPhotoUrl(existing)) return existing;

  const payload = normalizePhotoPayload(existing);
  if (!payload || payload.length < 20) {
    throw new Error('بيانات الصورة غير صالحة');
  }
  if (payload.length > MAX_PAYLOAD_CHARS) {
    throw new Error('حجم الصورة كبير جداً (الحد الأقصى تقريباً 5 ميجا)');
  }

  await ensurePhotoStoreSheet();

  const photoId = `eq-${Date.now()}-${randomBytes(4).toString('hex')}`;
  const chunks = splitIntoChunks(payload);
  const rows = chunks.map((chunk, index) => [photoId, index, chunk]);

  await appendToSheet(SHEET_EQUIPMENT_PHOTOS, rows, false);

  return appendPhotoSignatureToUrl(
    `${getAppBaseUrl()}/api/equipment-photos/${encodeURIComponent(photoId)}`,
    photoId
  );
}

export async function loadEquipmentPhoto(
  photoId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const id = photoId.trim();
  if (!id) return null;

  let data: any[][] = [];
  try {
    data = await getSheetData(SHEET_EQUIPMENT_PHOTOS, false);
  } catch {
    return null;
  }

  const parts: { index: number; data: string }[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row?.[0] || row[0].toString().trim() !== id) continue;
    parts.push({
      index: Number(row[1]) || 0,
      data: row[2]?.toString() ?? '',
    });
  }

  if (parts.length === 0) return null;

  parts.sort((a, b) => a.index - b.index);
  const payload = parts.map((p) => p.data).join('');
  return parseStoredPayload(payload);
}
