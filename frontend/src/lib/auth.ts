const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export function clearToken(): void {
  // no-op: fluxo por cookie HttpOnly
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const finalOpts: RequestInit = { ...opts, credentials: 'include' };
  let res = await fetch(url, finalOpts);

  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) {
      res = await fetch(url, finalOpts); // repete uma vez
    } else {
      window.location.href = '/login';
      throw new Error('Sessão expirada');
    }
  }
  return res;
}
