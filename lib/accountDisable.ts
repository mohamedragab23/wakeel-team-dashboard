/**
 * Soft-disable admin accounts via permissions marker (no new sheet column required).
 * Never used for Financial Apply / equipment pilots.
 */

export const ACCOUNT_DISABLED_PREFIX = '__DISABLED__|';

export function isAccountDisabledPermissions(permissions: string | null | undefined): boolean {
  const p = String(permissions ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toUpperCase();
  return p === '__DISABLED__' || p.startsWith('__DISABLED__|');
}

export function stripAccountDisabledMarker(permissions: string | null | undefined): string {
  const raw = String(permissions ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (!raw) return '';
  if (raw.toUpperCase() === '__DISABLED__') return '';
  if (raw.toUpperCase().startsWith('__DISABLED__|')) {
    return raw.slice(ACCOUNT_DISABLED_PREFIX.length);
  }
  return raw;
}

export function markAccountDisabled(permissions: string | null | undefined): string {
  const raw = String(permissions ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
  if (isAccountDisabledPermissions(raw)) return raw;
  return `${ACCOUNT_DISABLED_PREFIX}${raw}`;
}
