/** Client-side fetch that always sends session cookie + Bearer token when available. */
export function getClientAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('token')?.trim();
  return token || null;
}

export function getClientAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getClientAuthToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
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
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
