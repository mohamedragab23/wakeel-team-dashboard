import type { Supervisor } from '@/lib/adminService';

export type SupervisorOrgRole = 'supervisor' | 'zone_manager' | 'regional_manager';

/** تطبيع كود المشرف للمقارنة (WA-013 = wa-013). */
export function normalizeSupervisorCode(code: unknown): string {
  return String(code ?? '')
    .trim()
    .toUpperCase();
}

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

/** قيمة عمود المنصب في شيت المشرفين (عربي). */
export function orgRoleToSheetLabel(role: SupervisorOrgRole | undefined): string {
  if (role === 'zone_manager') return 'مدير زون';
  if (role === 'regional_manager') return 'مدير منطقة';
  return '';
}

export function buildSupervisorCodeIndex(sups: Supervisor[]): {
  byExact: Map<string, Supervisor>;
  byNorm: Map<string, string>;
} {
  const byExact = new Map<string, Supervisor>();
  const byNorm = new Map<string, string>();
  for (const s of sups) {
    const c = String(s.code ?? '').trim();
    if (!c) continue;
    byExact.set(c, s);
    byNorm.set(normalizeSupervisorCode(c), c);
  }
  return { byExact, byNorm };
}

/** يحل كوداً من الشيت أو parentCode إلى الكود الحرفي في الشيت. */
export function resolveSupervisorCodeInSheet(
  raw: string,
  index: ReturnType<typeof buildSupervisorCodeIndex>
): string | null {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  if (index.byExact.has(t)) return t;
  return index.byNorm.get(normalizeSupervisorCode(t)) ?? null;
}

/** كل الأكواد في شجرة المشرفين تحت `rootCode` (يشمل الجذر) — عبر parentCode متسلسل. */
export function buildDescendantSupervisorCodes(sups: Supervisor[], rootCode: string): Set<string> {
  const rootResolved = resolveSupervisorCodeInSheet(rootCode, buildSupervisorCodeIndex(sups));
  const out = new Set<string>();
  if (!rootResolved) return out;

  const index = buildSupervisorCodeIndex(sups);
  out.add(rootResolved);

  let changed = true;
  while (changed) {
    changed = false;
    for (const s of sups) {
      const c = String(s.code ?? '').trim();
      if (!c || out.has(c)) continue;
      const parentResolved = resolveSupervisorCodeInSheet(String(s.parentCode ?? ''), index);
      if (parentResolved && out.has(parentResolved)) {
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

/** أكواد المشرفين التشغيليين (منصب مشرف) ضمن شجرة `rootCode`. */
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

export type HierarchyAuditIssue = {
  code: string;
  name: string;
  orgRole: SupervisorOrgRole;
  issue: 'missing_parent' | 'parent_not_found' | 'wrong_parent_role' | 'orphan_supervisor';
  detail: string;
};

/** تدقيق الربط: مشرفون بلا مدير، مديرو زون بلا مدير منطقة، parent غير موجود. */
export function auditSupervisorHierarchy(sups: Supervisor[]): HierarchyAuditIssue[] {
  const index = buildSupervisorCodeIndex(sups);
  const issues: HierarchyAuditIssue[] = [];

  for (const s of sups) {
    const code = String(s.code ?? '').trim();
    if (!code) continue;
    const name = String(s.name ?? '').trim() || code;
    const role = s.orgRole ?? 'supervisor';
    const parentRaw = String(s.parentCode ?? '').trim();

    if (role === 'supervisor') {
      if (!parentRaw) {
        issues.push({
          code,
          name,
          orgRole: role,
          issue: 'orphan_supervisor',
          detail: 'مشرف تشغيلي بدون مدير مباشر — عيّن مدير الزون في إدارة المشرفين',
        });
        continue;
      }
      const parentResolved = resolveSupervisorCodeInSheet(parentRaw, index);
      if (!parentResolved) {
        issues.push({
          code,
          name,
          orgRole: role,
          issue: 'parent_not_found',
          detail: `المدير المباشر "${parentRaw}" غير موجود في الشيت`,
        });
        continue;
      }
      const parent = index.byExact.get(parentResolved)!;
      const pr = parent.orgRole ?? 'supervisor';
      if (pr !== 'zone_manager' && pr !== 'regional_manager') {
        issues.push({
          code,
          name,
          orgRole: role,
          issue: 'wrong_parent_role',
          detail: `المدير المباشر ${parentResolved} ليس مدير زون (منصبه: ${pr})`,
        });
      }
    }

    if (role === 'zone_manager' && !parentRaw) {
      issues.push({
        code,
        name,
        orgRole: role,
        issue: 'missing_parent',
        detail: 'مدير زون بدون مدير منطقة — اربطه من حفظ مدير المنطقة أو إدارة المشرفين',
      });
    }

    if (role === 'zone_manager' && parentRaw) {
      const parentResolved = resolveSupervisorCodeInSheet(parentRaw, index);
      if (!parentResolved) {
        issues.push({
          code,
          name,
          orgRole: role,
          issue: 'parent_not_found',
          detail: `مدير المنطقة "${parentRaw}" غير موجود`,
        });
      } else {
        const parent = index.byExact.get(parentResolved)!;
        if ((parent.orgRole ?? 'supervisor') !== 'regional_manager') {
          issues.push({
            code,
            name,
            orgRole: role,
            issue: 'wrong_parent_role',
            detail: `المدير المباشر ${parentResolved} يجب أن يكون مدير منطقة`,
          });
        }
      }
    }
  }

  return issues;
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
