/**
 * إنشاء تبويبات Google Sheets الخاصة بوحدات المعدات (إن لم تكن موجودة).
 */
import { ensureSheetExists } from '@/lib/googleSheets';
import {
  DEDUCTION_IMPORT_HEADERS,
  DEDUCTION_UPLOAD_LOG_HEADERS,
  DEDUCTIONS_ACTUAL_HEADERS,
  SHEET_DEDUCTIONS_ACTUAL,
  SHEET_DEDUCTIONS_IMPORT,
  SHEET_DEDUCTIONS_UPLOAD_LOG,
  SHEET_EQUIPMENT_DELIVERY,
  SHEET_EQUIPMENT_PHOTOS,
  SHEET_EQUIPMENT_RETURN,
} from '@/lib/equipmentSheetConstants';
import { ensureMainInventoryInitialized } from '@/lib/mainInventoryService';

const DELIVERY_HEADERS = [
  'كود_المشرف',
  'اسم_المشرف',
  'كود_المندوب',
  'اسم_المندوب',
  'الزون',
  'نوع_التسليم',
  'باوتش_موتوسيكل',
  'باوتش_عجلة',
  'تيشرت',
  'جاكيت',
  'خوذة',
  'صورة_base64',
  'الحالة',
  'تاريخ_الطلب',
  'تاريخ_المعالجة',
  'معالج_بواسطة',
  'سبب_الرفض',
];

const RETURN_HEADERS = [
  'كود_المشرف',
  'اسم_المشرف',
  'كود_المندوب',
  'اسم_المندوب',
  'الزون',
  'باوتش_موتوسيكل',
  'باوتش_عجلة',
  'تيشرت',
  'جاكيت',
  'خوذة',
  'الحالة',
  'تاريخ_الطلب',
  'تاريخ_المعالجة',
  'معالج_بواسطة',
  'سبب_الرفض',
];

export async function ensureAllEquipmentSheets(): Promise<{
  ok: true;
  ensured: string[];
}> {
  const ensured: string[] = [];

  await ensureSheetExists(SHEET_EQUIPMENT_DELIVERY, [...DELIVERY_HEADERS]);
  ensured.push(SHEET_EQUIPMENT_DELIVERY);

  await ensureSheetExists(SHEET_EQUIPMENT_PHOTOS, ['معرف_الصورة', 'رقم_الجزء', 'البيانات']);
  ensured.push(SHEET_EQUIPMENT_PHOTOS);

  await ensureSheetExists(SHEET_EQUIPMENT_RETURN, [...RETURN_HEADERS]);
  ensured.push(SHEET_EQUIPMENT_RETURN);

  await ensureSheetExists(SHEET_DEDUCTIONS_IMPORT, [...DEDUCTION_IMPORT_HEADERS]);
  ensured.push(SHEET_DEDUCTIONS_IMPORT);

  await ensureSheetExists(SHEET_DEDUCTIONS_UPLOAD_LOG, [...DEDUCTION_UPLOAD_LOG_HEADERS]);
  ensured.push(SHEET_DEDUCTIONS_UPLOAD_LOG);

  await ensureSheetExists(SHEET_DEDUCTIONS_ACTUAL, [...DEDUCTIONS_ACTUAL_HEADERS]);
  ensured.push(SHEET_DEDUCTIONS_ACTUAL);

  await ensureMainInventoryInitialized();
  ensured.push('المخزون_الرئيسي');

  return { ok: true, ensured };
}
