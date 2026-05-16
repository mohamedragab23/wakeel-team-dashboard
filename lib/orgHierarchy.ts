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

/** أكثر من جذر في JWT/الشيت: WA-014|WA-007 أو فاصلة عربية/إنجليزية */
export function parseLinkedSupervisorRootCodes(raw: string | undefined | null): string[] {
  const s = String(raw ?? '')
    .replace(/\uFEFF/g, '')
    .trim();
  if (!s) return [];
  /** فصل الأكواد بـ | أو فاصلة (لا نفصل بمسافة حتى لا نكسر أسماء إن وُضعت بالخطأ) */
  return s
    .split(/[|،,\n\r]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** اتحاد أشجار متعددة (مدير منطقة له عدة مديري زون كجذور صريحة). */
export function buildDescendantSupervisorCodesMulti(sups: Supervisor[], rootCodes: string[]): Set<string> {
  const out = new Set<string>();
  for (const r of rootCodes) {
    for (const c of buildDescendantSupervisorCodes(sups, r)) out.add(c);
  }
  return out;
}

/** أكواد المشرفين التشغيليين (منصب مشرف) ضمن شجرة `rootCode` — بدون مديري زون/منطقة. */
export function getDescendantLeafSupervisorCodes(sups: Supervisor[], rootCode: string): string[] {
  const tree = buildDescendantSupervisorCodes(sups, rootCode);
  const out: string[] = [];
  for (const c of tree) {
    const s = sups.find((x) => String(x.code ?? '').trim() === c);
    const role = s?.orgRole ?? 'supervisor';
    if (role === 'supervisor') out.push(c);
  }
  return out;
}

/** من يظهر في تقرير أداء المشرفين حسب منصب الأدمن في JWT. */
export function shouldIncludeInSupervisorPerformanceReport(
  viewerAdminOrgRole: 'full' | 'regional' | 'zone' | undefined,
  subjectOrgRole: SupervisorOrgRole | undefined
): boolean {
  const subject = subjectOrgRole ?? 'supervisor';
  if (!viewerAdminOrgRole || viewerAdminOrgRole === 'full') return true;
  if (viewerAdminOrgRole === 'zone') return subject === 'supervisor';
  if (viewerAdminOrgRole === 'regional') return subject === 'supervisor' || subject === 'zone_manager';
  return true;
}
