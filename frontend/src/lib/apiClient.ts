import { authFetch, clearToken, redirectToLogin } from '@/lib/auth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

type QueryValue = string | number | boolean | null | undefined;

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, QueryValue>;
  body?: unknown;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class ApiError extends Error {
  status: number;
  response: {
    status: number;
    data: unknown;
  };

  constructor(status: number, data: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.response = { status, data };
  }
}

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const absolute = path.startsWith('http://') || path.startsWith('https://');
  const basePath = absolute
    ? path
    : `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  const url = new URL(basePath, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return absolute ? url.toString() : `${url.pathname}${url.search}`;
}

function isJsonResponse(res: Response): boolean {
  const contentType = res.headers.get('content-type');
  return contentType?.includes('application/json') ?? false;
}

async function parseResponseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;

  if (isJsonResponse(res)) {
    return res.json();
  }

  const text = await res.text();
  return text.length > 0 ? text : null;
}

async function request<T>(method: string, path: string, opts: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
  const { params, body, headers, ...rest } = opts;
  const url = buildUrl(path, params);

  const requestHeaders = new Headers(headers);

  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      payload = body;
    } else {
      requestHeaders.set('Content-Type', 'application/json');
      payload = JSON.stringify(body);
    }
  }

  const res = await authFetch(url, {
    ...rest,
    method,
    headers: requestHeaders,
    body: payload,
  });

  const parsed = await parseResponseBody(res);

  if (!res.ok) {
    if (res.status === 401) {
      clearToken();
      redirectToLogin();
    }

    throw new ApiError(res.status, parsed);
  }

  return {
    data: parsed as T,
    status: res.status,
    headers: res.headers,
  };
}

export const apiClient = {
  get: <T>(url: string, opts?: ApiRequestOptions) => request<T>('GET', url, opts),
  post: <T>(url: string, body?: unknown, opts?: ApiRequestOptions) =>
    request<T>('POST', url, { ...opts, body }),
  patch: <T>(url: string, body?: unknown, opts?: ApiRequestOptions) =>
    request<T>('PATCH', url, { ...opts, body }),
  delete: <T>(url: string, opts?: ApiRequestOptions) => request<T>('DELETE', url, opts),
};

export default apiClient;
