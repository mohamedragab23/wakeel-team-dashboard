export type RiderStatusCategory = 'active' | 'inactive' | 'suspended' | 'resigned';

export function classifyRiderStatus(statusRaw: unknown): RiderStatusCategory {
  const s = String(statusRaw ?? 'نشط')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();

  if (!s || s === 'نشط' || s === 'active') return 'active';
  if (s.includes('مُقال') || s.includes('مقال') || s.includes('resign') || s.includes('إقالة')) return 'resigned';
  if (s.includes('معلق') || s.includes('suspend') || s.includes('إيقاف') || s.includes('موقوف')) return 'suspended';
  if (s === 'متوقف' || s.includes('inactive') || s.includes('غير نشط') || s.includes('غير_نشط')) return 'inactive';
  return 'active';
}

export function riderStatusLabelAr(cat: RiderStatusCategory): string {
  switch (cat) {
    case 'active':
      return 'نشط';
    case 'inactive':
      return 'غير نشط';
    case 'suspended':
      return 'معلق';
    case 'resigned':
      return 'مُقال';
  }
}
