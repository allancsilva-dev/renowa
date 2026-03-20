import { authFetch } from '@/lib/auth';

export const apiClient = {
  get: (url: string, opts?: RequestInit) =>
    authFetch(url, {
      ...opts,
      method: 'GET',
    }),

  post: (url: string, body: unknown, opts?: RequestInit) =>
    authFetch(url, {
      ...opts,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: (url: string, body: unknown, opts?: RequestInit) =>
    authFetch(url, {
      ...opts,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: (url: string, opts?: RequestInit) =>
    authFetch(url, {
      ...opts,
      method: 'DELETE',
    }),
};
