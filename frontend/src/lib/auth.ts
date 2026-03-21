const AUTH_URL = import.meta.env.VITE_AUTH_URL ?? 'https://auth.zonadev.tech';
const APP_AUD = import.meta.env.VITE_APP_AUD ?? 'renowa.zonadev.tech';

let accessToken: string | null = null;
let tokenExpiresAt = 0;
let refreshPromise: Promise<string> | null = null;
let isLoggingOut = false;

function isAlreadyOnLoginRoute(): boolean {
  return window.location.pathname.toLowerCase().includes('/login');
}

export function redirectToLogin(redirectTo: string = window.location.href): void {
  if (isLoggingOut || isAlreadyOnLoginRoute()) {
    return;
  }

  isLoggingOut = true;
  window.location.href = `${AUTH_URL}/login`
    + `?app=${APP_AUD}`
    + `&redirect=${encodeURIComponent(redirectTo)}`;
}

export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) {
    return accessToken;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = doTokenExchange();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function doTokenExchange(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(`${AUTH_URL}/api/oauth/token?aud=${APP_AUD}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(3000),
      });

      if (res.status === 401) {
        clearToken();
        redirectToLogin();
        throw new Error('Session expired');
      }

      if (!res.ok) {
        throw new Error(`Token exchange failed: ${res.status}`);
      }

      const data = (await res.json()) as {
        access_token: string;
        expires_in: number;
      };

      accessToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in * 1000);
      return accessToken;
    } catch (err) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Unreachable');
}

export function clearToken(): void {
  accessToken = null;
  tokenExpiresAt = 0;
}

export async function authFetch(url: string, opts: RequestInit = {}) {
  const token = await getAccessToken();
  return fetch(url, {
    ...opts,
    headers: {
      ...opts.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
