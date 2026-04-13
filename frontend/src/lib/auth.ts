const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export function clearToken(): void {
  // no-op in the new cookie-based flow; kept for compatibility
}

export async function authFetch(url: string, opts: RequestInit = {}) {
  const finalOpts: RequestInit = {
    ...opts,
    credentials: 'include',
  };

  const res = await fetch(url, finalOpts);

  if (res.status === 401) {
    // Start OIDC flow via backend
    const returnTo = window.location.href;
    window.location.href = `${API_URL}/auth/oidc/start?return_to=${encodeURIComponent(returnTo)}`;
    throw new Error('Redirecting to login');
  }

  return res;
}
