export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

interface WrappedList<T> {
  data?: T[];
  meta?: ApiMeta;
  total?: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function normalizeListResponse<T>(
  payload: unknown,
  fallbackPage: number,
  fallbackLimit: number,
): { items: T[]; meta: PaginationMeta; serverPaginated: boolean } {
  const safeLimit = Math.max(1, fallbackLimit);

  if (Array.isArray(payload)) {
    const total = payload.length;
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    return {
      items: payload,
      meta: {
        total,
        page: fallbackPage,
        limit: safeLimit,
        totalPages,
      },
      serverPaginated: false,
    };
  }

  if (isObject(payload)) {
    const wrapped = payload as WrappedList<T>;
    const list = Array.isArray(wrapped.data) ? wrapped.data : [];

    if (isObject(wrapped.meta)) {
      const total = Number(wrapped.meta.total ?? list.length);
      const page = Number(wrapped.meta.page ?? fallbackPage);
      const limit = Math.max(1, Number(wrapped.meta.limit ?? safeLimit));
      const totalPages = Number(wrapped.meta.totalPages ?? Math.max(1, Math.ceil(total / limit)));

      return {
        items: list,
        meta: {
          total,
          page,
          limit,
          totalPages,
        },
        serverPaginated: true,
      };
    }

    const total = Number(wrapped.total ?? list.length);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
      items: list,
      meta: {
        total,
        page: fallbackPage,
        limit: safeLimit,
        totalPages,
      },
      serverPaginated: false,
    };
  }

  return {
    items: [],
    meta: {
      total: 0,
      page: fallbackPage,
      limit: safeLimit,
      totalPages: 1,
    },
    serverPaginated: false,
  };
}
