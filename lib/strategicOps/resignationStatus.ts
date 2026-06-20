/** حالات الإقالة المعتمدة في شيت طلبات_الإقالة */
export function isApprovedResignationStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();

  if (!s) return false;

  return (
    s === 'approved' ||
    s === 'accepted' ||
    s.includes('تمت الموافقة') ||
    s.includes('مقبول') ||
    s === 'مقبول' ||
    s.includes('موافق')
  );
}

/** حالة الموقوف من شيت المناديب (مكمّل — ليس أساس حساب النشاط) */
export function isSheetSuspendedStatus(statusRaw: unknown): boolean {
  const s = String(statusRaw ?? '').trim().toLowerCase();
  return s.includes('معلق') || s.includes('suspend') || s.includes('إيقاف') || s.includes('موقوف');
}
