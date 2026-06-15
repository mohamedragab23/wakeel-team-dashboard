/**
 * Equipment limits storage — Google Sheets primary, local JSON fallback.
 * Preserves backward compatibility with data/equipment-limits.json on Vercel.
 */

import fs from 'fs';
import path from 'path';
import { appendToSheet, ensureSheetExists, getSheetData, updateSheetRow } from '@/lib/googleSheets';

export interface SupervisorLimits {
  motorcycleBox: number;
  bicycleBox: number;
  tshirt: number;
  jacket: number;
  helmet: number;
}

const SHEET_NAME = 'حدود_المعدات';
const LIMITS_FILE = path.join(process.cwd(), 'data', 'equipment-limits.json');

const defaultLimits: SupervisorLimits = {
  motorcycleBox: 0,
  bicycleBox: 0,
  tshirt: 0,
  jacket: 0,
  helmet: 0,
};

const HEADERS = [
  'كود المشرف',
  'صندوق دراجة نارية',
  'صندوق دراجة',
  'تيشرت',
  'جاكيت',
  'خوذة',
];

export function normalizeLimits(raw: Record<string, unknown> | null | undefined): SupervisorLimits {
  if (!raw || typeof raw !== 'object') return { ...defaultLimits };
  const r = raw as Partial<SupervisorLimits>;
  return {
    motorcycleBox: Math.max(0, Math.floor(Number(r.motorcycleBox)) || 0),
    bicycleBox: Math.max(0, Math.floor(Number(r.bicycleBox)) || 0),
    tshirt: Math.max(0, Math.floor(Number(r.tshirt)) || 0),
    jacket: Math.max(0, Math.floor(Number(r.jacket)) || 0),
    helmet: Math.max(0, Math.floor(Number(r.helmet)) || 0),
  };
}

function readJsonLimits(): Record<string, SupervisorLimits> {
  try {
    if (fs.existsSync(LIMITS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf-8'));
      return typeof parsed.limits === 'object' ? parsed.limits : {};
    }
  } catch (e) {
    console.error('[EquipmentLimitsStore] JSON read error:', e);
  }
  return {};
}

function writeJsonLimits(limits: Record<string, SupervisorLimits>): boolean {
  try {
    const dataDir = path.dirname(LIMITS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(LIMITS_FILE, JSON.stringify({ limits }, null, 2));
    return true;
  } catch (e) {
    console.error('[EquipmentLimitsStore] JSON write error:', e);
    return false;
  }
}

function rowToLimits(row: unknown[]): SupervisorLimits {
  return normalizeLimits({
    motorcycleBox: row[1],
    bicycleBox: row[2],
    tshirt: row[3],
    jacket: row[4],
    helmet: row[5],
  });
}

function limitsToRow(code: string, limits: SupervisorLimits): (string | number)[] {
  return [code, limits.motorcycleBox, limits.bicycleBox, limits.tshirt, limits.jacket, limits.helmet];
}

async function readSheetLimits(): Promise<Record<string, SupervisorLimits>> {
  const out: Record<string, SupervisorLimits> = {};
  try {
    await ensureSheetExists(SHEET_NAME, HEADERS);
    const rows = await getSheetData(SHEET_NAME, false);
    for (let i = 1; i < rows.length; i++) {
      const code = rows[i]?.[0]?.toString().trim();
      if (!code) continue;
      out[code] = rowToLimits(rows[i]);
    }
  } catch (e) {
    console.warn('[EquipmentLimitsStore] Sheet read failed, using JSON fallback:', e);
  }
  return out;
}

async function writeSheetLimits(limits: Record<string, SupervisorLimits>): Promise<boolean> {
  try {
    await ensureSheetExists(SHEET_NAME, HEADERS);
    const rows = await getSheetData(SHEET_NAME, false);
    const codeToRow = new Map<string, number>();
    for (let i = 1; i < rows.length; i++) {
      const code = rows[i]?.[0]?.toString().trim();
      if (code) codeToRow.set(code, i + 1);
    }

    for (const [code, lim] of Object.entries(limits)) {
      const existingRow = codeToRow.get(code);
      const rowData = limitsToRow(code, lim);
      if (existingRow) {
        await updateSheetRow(SHEET_NAME, existingRow, rowData);
      } else {
        await appendToSheet(SHEET_NAME, [rowData], false);
      }
    }
    return true;
  } catch (e) {
    console.error('[EquipmentLimitsStore] Sheet write error:', e);
    return false;
  }
}

/** Read limits — sheet data merged over JSON (sheet wins). */
export async function readEquipmentLimits(): Promise<Record<string, SupervisorLimits>> {
  const json = readJsonLimits();
  const sheet = await readSheetLimits();
  return { ...json, ...sheet };
}

/** Write limits to Google Sheet (primary). JSON backup is best-effort only. */
export async function writeEquipmentLimits(limits: Record<string, SupervisorLimits>): Promise<boolean> {
  const sheetOk = await writeSheetLimits(limits);
  try {
    writeJsonLimits(limits);
  } catch {
    // JSON backup optional
  }
  return sheetOk;
}
