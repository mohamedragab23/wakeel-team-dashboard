/**
 * Equipment Pricing API — Admin Source of Truth for أسعار_المعدات.
 * Rider liability creation reads this sheet (fail closed). UI may show approved defaults only for display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { updateSheetRange, ensureSheetExists } from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import {
  loadAdminEquipmentPricingForAdminUi,
  loadAdminEquipmentPricingFromSheets,
} from '@/lib/equipmentPricing/loadAdminPricing';
import { validateAndConvertAdminPricingEgp } from '@/lib/equipmentPricing/validate';
import type { AdminEquipmentPricingEgp } from '@/lib/equipmentPricing/types';
import { ADMIN_EQUIPMENT_PRICING_SHEET } from '@/lib/equipmentPricing/types';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOCAL_FILE = path.join(process.cwd(), 'data', 'equipment-pricing.json');

const PRICING_HEADERS = [
  'motorcycleBox',
  'bicycleBox',
  'tshirt',
  'jacket',
  'helmet',
  'securityCheck',
] as const;

function saveLocalPricingIfPossible(pricing: AdminEquipmentPricingEgp): void {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    if (typeof fs !== 'undefined' && fs.existsSync && !fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (typeof fs !== 'undefined' && fs.writeFileSync) {
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(pricing, null, 2));
    }
  } catch {
    // Expected on Vercel
  }
}

async function savePricingToSheets(pricing: AdminEquipmentPricingEgp): Promise<boolean> {
  try {
    await ensureSheetExists(ADMIN_EQUIPMENT_PRICING_SHEET, [...PRICING_HEADERS]);
    return await updateSheetRange(ADMIN_EQUIPMENT_PRICING_SHEET, 'A2:F2', [
      [
        pricing.motorcycleBox,
        pricing.bicycleBox,
        pricing.tshirt,
        pricing.jacket,
        pricing.helmet,
        pricing.securityCheck,
      ],
    ]);
  } catch (e) {
    console.error('[Equipment Pricing] Sheets write error:', e);
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const ep = assertAdminApiAccess(decoded, 'equipment_pricing');
    if (ep) return ep;

    const ui = await loadAdminEquipmentPricingForAdminUi();
    return NextResponse.json({
      success: true,
      data: ui.egp,
      meta: {
        fromSheets: ui.fromSheets,
        displayOnlyDefaults: ui.displayOnlyDefaults,
        needsSecurityColumnSave: ui.needsSecurityColumnSave,
        sourceOfTruth: 'أسعار_المعدات',
        note: ui.needsSecurityColumnSave
          ? 'Security Check not persisted yet — save Admin pricing to write securityCheck=100. NEW liability creation remains fail-closed until then.'
          : ui.displayOnlyDefaults
            ? 'Display defaults only — NEW liability creation fails closed until Admin prices are saved to Sheets'
            : 'Loaded from Admin Sheets',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('Get equipment pricing error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const ep2 = assertAdminApiAccess(decoded, 'equipment_pricing');
    if (ep2) return ep2;

    const body = (await request.json()) as Partial<AdminEquipmentPricingEgp>;
    // Allow omitting jacket/helmet by filling approved custody defaults; security required.
    const candidate: Partial<AdminEquipmentPricingEgp> = {
      motorcycleBox: body.motorcycleBox,
      bicycleBox: body.bicycleBox,
      tshirt: body.tshirt,
      jacket: body.jacket ?? APPROVED_ADMIN_EQUIPMENT_PRICING_EGP.jacket,
      helmet: body.helmet ?? APPROVED_ADMIN_EQUIPMENT_PRICING_EGP.helmet,
      securityCheck: body.securityCheck,
    };

    const validated = validateAndConvertAdminPricingEgp(candidate);
    if (!validated.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `أسعار غير صالحة: ${validated.detail}`,
          code: validated.error,
        },
        { status: 400 }
      );
    }

    const before = await loadAdminEquipmentPricingFromSheets();
    const saved = await savePricingToSheets(validated.egp);
    if (!saved) {
      return NextResponse.json({ success: false, error: 'فشل حفظ الأسعار' }, { status: 500 });
    }
    saveLocalPricingIfPossible(validated.egp);

    void appendAuditLog({
      domain: 'equipment',
      action: 'update_equipment_pricing',
      entityType: 'equipment_pricing',
      entityCode: ADMIN_EQUIPMENT_PRICING_SHEET,
      actorCode: decoded.code || 'admin',
      actorName: decoded.name || decoded.code || 'admin',
      before: before.ok ? before.egp : null,
      after: validated.egp,
    }).catch((err) => console.error('[Equipment Pricing] audit failed:', err));

    return NextResponse.json({
      success: true,
      message: 'تم حفظ الأسعار بنجاح. التعديلات مصدر الحقيقة لالتزامات المعدات الجديدة.',
      data: validated.egp,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('Save equipment pricing error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
