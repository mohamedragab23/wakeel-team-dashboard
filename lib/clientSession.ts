/** Non-sensitive session profile (no JWT). Token lives in httpOnly cookie only. */

export type ClientSessionUser = {
  success?: boolean;
  code?: string;
  name?: string;
  role?: string;
  permissions?: string;
  dataZone?: string;
  adminOrgRole?: string;
  linkedSupervisorCode?: string;
};

const USER_KEY = 'wakeel_user';

export function getStoredUser(): ClientSessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem('user');
    if (!raw) return null;
    return JSON.parse(raw) as ClientSessionUser;
  } catch {
    return null;
  }
}

export function setStoredUser(user: ClientSessionUser): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem('user');
  localStorage.removeItem('token');
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem('user');
  localStorage.removeItem('token');
}
