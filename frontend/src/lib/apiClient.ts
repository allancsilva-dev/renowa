import { authFetch } from '@/lib/auth';

const BASE_URL = import.meta.env.VITE_API_URL;

type QueryValue = string | number | boolean | null | undefined;

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, QueryValue>;
}

function buildUrl(url: string, params?: Record<string, QueryValue>): string {
  const normalizedBase = BASE_URL?.replace(/\/$/, '') ?? '';
  const normalizedPath = url.startsWith('/') ? url : `/${url}`;
  const full = `${normalizedBase}${normalizedPath}`;

  if (!params) {
    return full;
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `${full}?${query}` : full;
}

async function request<T>(url: string, options: ApiRequestOptions = {}): Promise<{ data: T }> {
  const { params, ...fetchOptions } = options;
  const finalUrl = buildUrl(url, params);

  const res = await authFetch(finalUrl, fetchOptions);

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw {
      response: {
        status: res.status,
        data,
      }
    };
  }

  return { data: data as T };
}

export const apiClient = {
  get: <T>(url: string, options: ApiRequestOptions = {}) => request<T>(url, options),

  post: <T>(url: string, body?: unknown, options: ApiRequestOptions = {}) =>
    request<T>(url, {
      ...options,
      method: 'POST',
      headers: body instanceof FormData
        ? options.headers
        : { ...options.headers, 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T>(url: string, body?: unknown, options: ApiRequestOptions = {}) =>
    request<T>(url, {
      ...options,
      method: 'PATCH',
      headers: body instanceof FormData
        ? options.headers
        : { ...options.headers, 'Content-Type': 'application/json' },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T>(url: string, options: ApiRequestOptions = {}) =>
    request<T>(url, { ...options, method: 'DELETE' }),
};

export default apiClient;
