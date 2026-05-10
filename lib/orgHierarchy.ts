import type { Supervisor } from '@/lib/adminService';

export type SupervisorOrgRole = 'supervisor' | 'zone_manager' | 'regional_manager';

/** قراءة عمود المنصب من شيت المشرفين (عربي/إنجليزي). */
export function parseSupervisorOrgRole(raw: string | undefined | null): SupervisorOrgRole {
  const s = String(raw ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!s) return 'supervisor';
  if (s.includes('منطقة') || s.includes('regional') || s === 'rm') return 'regional_manager';
  if (s.includes('زون') || s.includes('zone') || s === 'zm') return 'zone_manager';
  return 'supervisor';
}

/** كل الأكواد في شجرة المشرفين تحت `rootCode` (يشمل الجذر). */
export function buildDescendantSupervisorCodes(sups: Supervisor[], rootCode: string): Set<string> {
  const root = String(rootCode ?? '').trim();
  const out = new Set<string>();
  if (!root) return out;

  const byCode = new Map(sups.map((s) => [String(s.code ?? '').trim(), s] as const));
  if (!byCode.has(root)) return out;

  out.add(root);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sups) {
      const c = String(s.code ?? '').trim();
      const p = String(s.parentCode ?? '').trim();
      if (!c || out.has(c)) continue;
      if (p && out.has(p)) {
        out.add(c);
        changed = true;
      }
    }
  }
  return out;
}
