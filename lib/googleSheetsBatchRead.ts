/**
 * Batched Google Sheets READ helper (sibling to protected lib/googleSheets.ts).
 * Reimplements stash batchGet pattern without modifying Protected files.
 * READ-ONLY: bounded retries for 429/quota. Do not use for financial writes.
 */
import {
  getMainSpreadsheetId,
  getSheetsClientFor,
} from '@/lib/googleSheetsAuth';
import { logStructured } from '@/lib/requestTrace';

export const SHEETS_QUOTA_USER_AR =
  'البيانات عليها ضغط مؤقت. حاول مرة أخرى بعد لحظات.';

/** Test/prod instrumentation — Sheets API read units (values.get / batchGet / spreadsheets.get). */
let sheetsApiReadCount = 0;

export function getSheetsApiReadCount(): number {
  return sheetsApiReadCount;
}

export function resetSheetsApiReadCount(): void {
  sheetsApiReadCount = 0;
}

export function bumpSheetsApiReadCount(n = 1): void {
  sheetsApiReadCount += n;
}

export function isSheetsQuotaError(error: unknown): boolean {
  const parts: string[] = [String(error || '')];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  }
  if (error && typeof error === 'object') {
    const anyErr = error as {
      code?: unknown;
      status?: unknown;
      response?: { status?: unknown; data?: { error?: { message?: string; status?: string } } };
    };
    if (anyErr.code != null) parts.push(String(anyErr.code));
    if (anyErr.status != null) parts.push(String(anyErr.status));
    if (anyErr.response?.status != null) parts.push(String(anyErr.response.status));
    const nested = anyErr.response?.data?.error;
    if (nested?.message) parts.push(nested.message);
    if (nested?.status) parts.push(nested.status);
  }
  const blob = parts.join(' ').toLowerCase();
  return (
    blob.includes('quota exceeded') ||
    blob.includes('ratelimitexceeded') ||
    blob.includes('rate limit') ||
    blob.includes('read requests per minute') ||
    blob.includes('429') ||
    blob.includes('resource_exhausted')
  );
}

export function toSafeSheetsUserError(error: unknown): string {
  if (isSheetsQuotaError(error)) return SHEETS_QUOTA_USER_AR;
  if (error instanceof Error && error.message && !isSheetsQuotaError(error)) {
    // Strip Google project / quota metric details if present.
    const msg = error.message;
    if (/quota|project_number|sheets\.googleapis|Read requests/i.test(msg)) {
      return SHEETS_QUOTA_USER_AR;
    }
    return msg;
  }
  return SHEETS_QUOTA_USER_AR;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type BatchGetDeps = {
  batchGet: (ranges: string[]) => Promise<unknown[][][]>;
};

const defaultBatchGet = async (ranges: string[]): Promise<unknown[][][]> => {
  if (!ranges.length) return [];
  const sheets = await getSheetsClientFor('main');
  bumpSheetsApiReadCount(1);
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: getMainSpreadsheetId(),
    ranges,
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const valueRanges = response.data.valueRanges || [];
  return ranges.map((_, i) => (valueRanges[i]?.values as unknown[][]) || []);
};

/**
 * One Sheets API read for many ranges. Bounded exponential backoff on quota (reads only).
 */
export async function getSheetDataBatchOrThrow(
  ranges: string[],
  opts?: {
    maxAttempts?: number;
    deps?: BatchGetDeps;
  }
): Promise<unknown[][][]> {
  if (!ranges.length) return [];
  const maxAttempts = Math.max(1, Math.min(opts?.maxAttempts ?? 3, 3));
  const batchGet = opts?.deps?.batchGet ?? defaultBatchGet;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await batchGet(ranges);
    } catch (error: unknown) {
      lastErr = error;
      const quota = isSheetsQuotaError(error);
      logStructured('error', 'google_sheets_batch_get_failed', {
        rangesCount: ranges.length,
        attempt,
        quota,
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180),
      });
      if (!quota || attempt >= maxAttempts) break;
      const base = 250 * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 120);
      await sleep(base + jitter);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
