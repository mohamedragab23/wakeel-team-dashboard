import { getSheetData } from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_DELIVERY, SHEET_EQUIPMENT_RETURN } from '@/lib/equipmentSheetConstants';

export type ReturnQuantities = {
  motorcyclePouch: number;
  bicyclePouch: number;
  tshirt: number;
  jacket: number;
  helmet: number;
};

/**
 * - إن لم يوجد أي صف للمندوب+المشرف في تسليم_المعدات → يُقبل الطلب كمراجعة إدارية.
 * - إن وُجدت صفوف لكن بلا أي تسليم معتمد → مراجعة إدارية.
 * - إن وُجد تسليم معتمد: الرصيد = مجموع التسليم المعتمد − مجموع الاسترجاع المعتمد؛
 *   إن تجاوز الطلب الرصيد لأي صنف → رفض مع سبب واضح للمشرف.
 */
export async function validateEquipmentReturnAgainstDeliveries(
  supervisorCode: string,
  riderCode: string,
  requested: ReturnQuantities
): Promise<
  | { ok: true; mode: 'admin_review' }
  | { ok: true; mode: 'within_balance' }
  | { ok: false; error: string }
> {
  const sup = supervisorCode?.toString().trim();
  const rid = riderCode?.toString().trim();

  let deliveryData: any[][] = [];
  try {
    deliveryData = await getSheetData(SHEET_EQUIPMENT_DELIVERY, false);
  } catch {
    deliveryData = [];
  }

  const matchDeliveryRow = (row: any[]) =>
    row?.[0]?.toString().trim() === sup && row?.[2]?.toString().trim() === rid;

  let hasAnyDeliveryRow = false;
  for (let i = 1; i < deliveryData.length; i++) {
    if (matchDeliveryRow(deliveryData[i])) {
      hasAnyDeliveryRow = true;
      break;
    }
  }

  if (!hasAnyDeliveryRow) {
    return { ok: true, mode: 'admin_review' };
  }

  let delM = 0;
  let delB = 0;
  let delT = 0;
  let delJ = 0;
  let delH = 0;

  for (let i = 1; i < deliveryData.length; i++) {
    const row = deliveryData[i];
    if (!matchDeliveryRow(row)) continue;
    const st = row[12]?.toString().trim().toLowerCase() || '';
    if (st !== 'approved') continue;
    delM += Math.max(0, Number(row[6]) || 0);
    delB += Math.max(0, Number(row[7]) || 0);
    delT += Math.max(0, Number(row[8]) || 0);
    delJ += Math.max(0, Number(row[9]) || 0);
    delH += Math.max(0, Number(row[10]) || 0);
  }

  if (delM + delB + delT + delJ + delH <= 0) {
    return { ok: true, mode: 'admin_review' };
  }

  let retData: any[][] = [];
  try {
    retData = await getSheetData(SHEET_EQUIPMENT_RETURN, false);
  } catch {
    retData = [];
  }

  let retM = 0;
  let retB = 0;
  let retT = 0;
  let retJ = 0;
  let retH = 0;

  for (let i = 1; i < retData.length; i++) {
    const row = retData[i];
    if (row?.[0]?.toString().trim() !== sup || row?.[2]?.toString().trim() !== rid) continue;
    const st = row[10]?.toString().trim().toLowerCase() || '';
    if (st !== 'approved') continue;
    retM += Math.max(0, Number(row[5]) || 0);
    retB += Math.max(0, Number(row[6]) || 0);
    retT += Math.max(0, Number(row[7]) || 0);
    retJ += Math.max(0, Number(row[8]) || 0);
    retH += Math.max(0, Number(row[9]) || 0);
  }

  const balM = delM - retM;
  const balB = delB - retB;
  const balT = delT - retT;
  const balJ = delJ - retJ;
  const balH = delH - retH;

  const parts: string[] = [];
  const qM = Math.max(0, requested.motorcyclePouch);
  const qB = Math.max(0, requested.bicyclePouch);
  const qT = Math.max(0, requested.tshirt);
  const qJ = Math.max(0, requested.jacket);
  const qH = Math.max(0, requested.helmet);

  if (qM > balM) {
    parts.push(
      `باوتش موتوسيكل: طلبت استرجاع ${qM} بينما المتاح بعد التسليم المعتمد (${delM}) والاسترجاع المعتمد سابقاً (${retM}) هو ${balM}.`
    );
  }
  if (qB > balB) {
    parts.push(
      `باوتش عجلة: طلبت استرجاع ${qB} بينما المتاح هو ${balB} (تسليم معتمد ${delB} − مسترجع معتمد ${retB}).`
    );
  }
  if (qT > balT) {
    parts.push(
      `تيشرت: طلبت استرجاع ${qT} بينما المتاح هو ${balT} (تسليم معتمد ${delT} − مسترجع معتمد ${retT}).`
    );
  }
  if (qJ > balJ) {
    parts.push(
      `جاكيت: طلبت استرجاع ${qJ} بينما المتاح هو ${balJ} (تسليم معتمد ${delJ} − مسترجع معتمد ${retJ}).`
    );
  }
  if (qH > balH) {
    parts.push(
      `خوذة: طلبت استرجاع ${qH} بينما المتاح هو ${balH} (تسليم معتمد ${delH} − مسترجع معتمد ${retH}).`
    );
  }

  if (parts.length > 0) {
    return {
      ok: false,
      error:
        'لا يمكن استرجاع كمية أكبر مما تم تسليمه المعتمد بعد خصم الاسترجاعات المعتمدة سابقاً:\n' +
        parts.join('\n'),
    };
  }

  return { ok: true, mode: 'within_balance' };
}
