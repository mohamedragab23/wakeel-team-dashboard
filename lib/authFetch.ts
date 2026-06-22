import { clearStoredUser } from '@/lib/clientSession';

/** Session uses httpOnly cookie (`wakeel_auth_token`). No JWT in localStorage. */
export function getClientAuthToken(): string | null {
  return null;
}

export function getClientAuthHeaders(extra?: HeadersInit): HeadersInit {
  return { ...(extra || {}) };
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = getClientAuthHeaders(init.headers);
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
    headers,
  });
}

export function clearClientSession(): void {
  clearStoredUser();
}
