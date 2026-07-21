import { authFetch } from '@/lib/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

type QueryValue = string | number | boolean | null | undefined;

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, QueryValue>;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};

  if (headers instanceof Headers) {
    const mapped: Record<string, string> = {};
    headers.forEach((value, key) => {
      mapped[key] = value;
    });
    return mapped;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const externalSignal = fetchOptions.signal;
  const onAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  let res: Response;
  try {
    res = await authFetch(finalUrl, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onAbort);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

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
      headers: {
        ...normalizeHeaders(options.headers),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  patch: <T>(url: string, body?: unknown, options: ApiRequestOptions = {}) =>
    request<T>(url, {
      ...options,
      method: 'PATCH',
      headers: {
        ...normalizeHeaders(options.headers),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T>(url: string, body?: unknown, options: ApiRequestOptions = {}) =>
    request<T>(url, {
      ...options,
      method: 'PUT',
      headers: {
        ...normalizeHeaders(options.headers),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  delete: <T>(url: string, options: ApiRequestOptions = {}) =>
    request<T>(url, { ...options, method: 'DELETE' }),
};

export default apiClient;
