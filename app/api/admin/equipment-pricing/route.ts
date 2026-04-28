/**
 * Equipment Pricing API
 * Manages equipment prices for deduction calculations.
 * On Vercel the filesystem is read-only, so we use Google Sheets (أسعار_المعدات).
 * Locally we also try to write to a file for salaryService compatibility.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData, updateSheetRange, ensureSheetExists } from '@/lib/googleSheets';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const SHEET_NAME = 'أسعار_المعدات';
const LOCAL_FILE = path.join(process.cwd(), 'data', 'equipment-pricing.json');

interface EquipmentPricing {
  motorcycleBox: number;
  bicycleBox: number;
  tshirt: number;
  jacket: number;
  helmet: number;
}

const defaultPricing: EquipmentPricing = {
  motorcycleBox: 550,
  bicycleBox: 550,
  tshirt: 100,
  jacket: 200,
  helmet: 150,
};

function parsePricingFromRow(row: any[]): EquipmentPricing {
  return {
    motorcycleBox: Number(row?.[0]) >= 0 ? Number(row[0]) : defaultPricing.motorcycleBox,
    bicycleBox: Number(row?.[1]) >= 0 ? Number(row[1]) : defaultPricing.bicycleBox,
    tshirt: Number(row?.[2]) >= 0 ? Number(row[2]) : defaultPricing.tshirt,
    jacket: Number(row?.[3]) >= 0 ? Number(row[3]) : defaultPricing.jacket,
    helmet: Number(row?.[4]) >= 0 ? Number(row[4]) : defaultPricing.helmet,
  };
}

/** Read pricing from Google Sheets (works on Vercel) */
async function readPricingFromSheets(): Promise<EquipmentPricing | null> {
  try {
    const data = await getSheetData(SHEET_NAME, false);
    if (data && data.length >= 2 && data[1] && data[1].length >= 5) {
      return parsePricingFromRow(data[1]);
    }
  } catch (e) {
    console.error('[Equipment Pricing] Sheets read error:', e);
  }
  return null;
}

/** Read pricing from local file (dev only; fails on Vercel read-only) */
function readLocalPricing(): EquipmentPricing | null {
  try {
    if (typeof fs !== 'undefined' && fs.existsSync && fs.existsSync(LOCAL_FILE)) {
      const data = fs.readFileSync(LOCAL_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Equipment Pricing] Local file read error:', error);
  }
  return null;
}

/** Save pricing to Google Sheets (works on Vercel) */
async function savePricingToSheets(pricing: EquipmentPricing): Promise<boolean> {
  try {
    await ensureSheetExists(SHEET_NAME, ['motorcycleBox', 'bicycleBox', 'tshirt', 'jacket', 'helmet']);
    const updated = await updateSheetRange(SHEET_NAME, 'A2:E2', [[
      pricing.motorcycleBox,
      pricing.bicycleBox,
      pricing.tshirt,
      pricing.jacket,
      pricing.helmet,
    ]]);
    return updated;
  } catch (e) {
    console.error('[Equipment Pricing] Sheets write error:', e);
    return false;
  }
}

/** Optionally save to local file (for local dev; ignore errors on Vercel) */
function saveLocalPricingIfPossible(pricing: EquipmentPricing): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (typeof fs !== 'undefined' && fs.existsSync && !fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (typeof fs !== 'undefined' && fs.writeFileSync) {
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(pricing, null, 2));
    }
  } catch (_) {
    // Expected on Vercel (read-only FS); ignore
  }
}

// GET - Fetch equipment pricing (Sheets first so Vercel and local stay in sync)
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const fromSheets = await readPricingFromSheets();
    if (fromSheets) {
      return NextResponse.json({ success: true, data: fromSheets });
    }

    const localPricing = readLocalPricing();
    if (localPricing) {
      return NextResponse.json({ success: true, data: localPricing });
    }

    return NextResponse.json({ success: true, data: defaultPricing });
  } catch (error: any) {
    console.error('Get equipment pricing error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

// POST - Save equipment pricing (المدير يمكنه التعديل والتعديلات تظهر للمشرفين عبر نفس الملف)
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const pricing: EquipmentPricing = await request.json();

    if (
      pricing.motorcycleBox < 0 ||
      pricing.bicycleBox < 0 ||
      pricing.tshirt < 0 ||
      pricing.jacket < 0 ||
      pricing.helmet < 0
    ) {
      return NextResponse.json({ success: false, error: 'الأسعار يجب أن تكون موجبة' }, { status: 400 });
    }

    const saved = await savePricingToSheets(pricing);
    if (saved) {
      saveLocalPricingIfPossible(pricing);
      return NextResponse.json({ success: true, message: 'تم حفظ الأسعار بنجاح. التعديلات تظهر للمشرفين تلقائياً.' });
    }
    return NextResponse.json({ success: false, error: 'فشل حفظ الأسعار' }, { status: 500 });
  } catch (error: any) {
    console.error('Save equipment pricing error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

