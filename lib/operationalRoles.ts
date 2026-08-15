/**
 * Operational role presets — map to existing `limited:` AdminFeatureKey packs.
 * Does NOT introduce a parallel permission system or enable Financial Apply.
 */

import type { AdminFeatureKey } from '@/lib/adminFeatureAccess';
import { LIMITED_PREFIX } from '@/lib/adminFeatureAccess';
import { RECRUITMENT_MANAGER_PERMISSION } from '@/lib/authConstants';
import { stripAccountDisabledMarker } from '@/lib/accountDisable';

export const OPERATIONAL_ROLE_IDS = [
  'ADMIN_FULL',
  'EQUIPMENT_MANAGER',
  'FOLLOW_UP_SUPERVISOR',
  'ACCOUNTING_MANAGER',
  'RECRUITMENT_MANAGER',
] as const;

export type OperationalRoleId = (typeof OPERATIONAL_ROLE_IDS)[number];

export const OPERATIONAL_ROLE_LABELS_AR: Record<OperationalRoleId, string> = {
  ADMIN_FULL: 'أدمن كامل',
  EQUIPMENT_MANAGER: 'مسؤول المعدات',
  FOLLOW_UP_SUPERVISOR: 'مشرف متابعة المجموعات',
  ACCOUNTING_MANAGER: 'مسؤول الحسابات / المالية',
  RECRUITMENT_MANAGER: 'مسؤول التعيين',
};

/** Equipment workflow only — never FA / user admin / recruitment admin. */
export const EQUIPMENT_MANAGER_FEATURES: AdminFeatureKey[] = [
  'dashboard',
  'equipment_liability',
  'equipment_requests',
  'equipment_pricing',
  'equipment_limits',
  'main_inventory',
  'equipment_finance',
  'payout_cycles',
];

/** Group follow-up / monitoring only. */
export const FOLLOW_UP_SUPERVISOR_FEATURES: AdminFeatureKey[] = [
  'dashboard',
  'live_riders',
  'riders',
  'rider_comments',
  'rider_comments_dashboard',
  'rider_strategic_profiles',
];

/**
 * Finance / accounting review only.
 * Does NOT include equipment admin, user management, or FA enablement.
 */
export const ACCOUNTING_MANAGER_FEATURES: AdminFeatureKey[] = [
  'dashboard',
  'salaries',
  'salary_config',
  'deductions_reconcile',
  'debts',
  'payroll_ledger',
  'payout_cycles',
];

const ROLE_MARKER_PREFIX = 'role:';

export function isOperationalRoleId(v: unknown): v is OperationalRoleId {
  return OPERATIONAL_ROLE_IDS.includes(String(v || '') as OperationalRoleId);
}

/** Extract `role:XYZ` marker from permissions string if present. */
export function parseOperationalRoleFromPermissions(
  permissions: string | null | undefined
): OperationalRoleId | null {
  const p = stripAccountDisabledMarker(permissions);
  if (!p) return 'ADMIN_FULL';
  if (p.toLowerCase() === RECRUITMENT_MANAGER_PERMISSION) return 'RECRUITMENT_MANAGER';
  const m = p.match(/(?:^|\|)role:([A-Z0-9_]+)(?:\||$)/i);
  if (m && isOperationalRoleId(m[1].toUpperCase())) {
    return m[1].toUpperCase() as OperationalRoleId;
  }
  if (p.toLowerCase().startsWith(LIMITED_PREFIX)) return null;
  return 'ADMIN_FULL';
}

export function featuresForOperationalRole(
  role: OperationalRoleId
): AdminFeatureKey[] | 'all' {
  switch (role) {
    case 'ADMIN_FULL':
      return 'all';
    case 'EQUIPMENT_MANAGER':
      return [...EQUIPMENT_MANAGER_FEATURES];
    case 'FOLLOW_UP_SUPERVISOR':
      return [...FOLLOW_UP_SUPERVISOR_FEATURES];
    case 'ACCOUNTING_MANAGER':
      return [...ACCOUNTING_MANAGER_FEATURES];
    case 'RECRUITMENT_MANAGER':
      return ['recruitment', 'dashboard'];
    default:
      return 'all';
  }
}

/**
 * Build Admins-sheet permissions value for a role preset.
 * Recruitment manager keeps legacy sentinel `recruitment_manager`.
 */
export function buildPermissionsForOperationalRole(role: OperationalRoleId): string {
  if (role === 'ADMIN_FULL') return '';
  if (role === 'RECRUITMENT_MANAGER') return RECRUITMENT_MANAGER_PERMISSION;
  const features = featuresForOperationalRole(role);
  if (features === 'all') return '';
  return `${ROLE_MARKER_PREFIX}${role}|${LIMITED_PREFIX}${features.join(',')}`;
}

/** Strip role marker; leave limited: or empty/full for feature checks. */
export function permissionsForFeatureCheck(permissions: string | null | undefined): string {
  const p = String(permissions ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!p) return '';
  if (p.toLowerCase() === RECRUITMENT_MANAGER_PERMISSION) return p;
  const limitedIdx = p.toLowerCase().indexOf(LIMITED_PREFIX);
  if (limitedIdx >= 0) return p.slice(limitedIdx);
  // Remove role:XXX| prefix if present without limited
  return p.replace(/^\s*role:[A-Z0-9_]+\|?/i, '').trim();
}

export function roleAllowsFeature(
  role: OperationalRoleId,
  feature: AdminFeatureKey
): boolean {
  const feats = featuresForOperationalRole(role);
  if (feats === 'all') return true;
  return feats.includes(feature);
}
