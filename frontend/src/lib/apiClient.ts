import { authFetch } from '@/lib/auth';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

type QueryValue = string | number | boolean | null | undefined;

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, QueryValue>;
  /** Timeout em ms. Omitido, vale `DEFAULT_TIMEOUT_MS`. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Binário precisa de mais folga que JSON: emitir o papel em `PedidoDetalhe`
 * baixa uma imagem por produto do pedido, em fila de 6 por vez
 * (`fetchFotosPorProduto`). Com 10 s, uma conexão ruim derruba os downloads e
 * a emissão do papel é abortada por timeout (BACKLOG-0056).
 */
const BLOB_TIMEOUT_MS = 30_000;

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

/**
 * Executa a requisição e devolve a `Response` crua, já com auth, timeout e
 * tratamento de erro aplicados. Separado de `request` porque a leitura do
 * corpo difere: JSON é lido como texto, binário não pode ser.
 */
async function send(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { params, timeoutMs, ...fetchOptions } = options;
  const finalUrl = buildUrl(url, params);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
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

  return res;
}

async function request<T>(url: string, options: ApiRequestOptions = {}): Promise<{ data: T }> {
  const res = await send(url, options);

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

/**
 * Baixa um corpo binário (ex.: foto do produto). Não passa por `request`
 * porque `res.text()` corromperia os bytes. Em erro, o corpo ainda é lido
 * como JSON para preservar o formato de exceção que `getApiErrorMessage`
 * espera.
 */
async function requestBlob(url: string, options: ApiRequestOptions = {}): Promise<{ data: Blob }> {
  const res = await send(url, { timeoutMs: BLOB_TIMEOUT_MS, ...options });

  if (!res.ok) {
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    throw { response: { status: res.status, data } };
  }

  return { data: await res.blob() };
}

export const apiClient = {
  get: <T>(url: string, options: ApiRequestOptions = {}) => request<T>(url, options),

  /** GET de corpo binário — imagens e demais downloads autenticados. */
  getBlob: (url: string, options: ApiRequestOptions = {}) => requestBlob(url, options),

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
