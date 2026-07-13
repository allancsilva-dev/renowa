import { useState, useEffect, useCallback, useRef } from 'react';
import type { PaginatedResponse } from '@/types';

interface Options<T> {
  fetcher: (params: { page: number; limit: number }) => Promise<PaginatedResponse<T>>;
  limit?: number;
}

interface State<T> {
  data: T[];
  meta: PaginatedResponse<T>['meta'] | null;
  isLoading: boolean;
  error: string | null;
  page: number;
}

export function usePaginatedQuery<T>({ fetcher, limit = 20 }: Options<T>) {
  const requestId = useRef(0);
  const [state, setState] = useState<State<T>>({
    data: [],
    meta: null,
    isLoading: true,
    error: null,
    page: 1,
  });

  const load = useCallback(
    async (page: number) => {
      const currentRequest = ++requestId.current;
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const result = await fetcher({ page, limit });
        if (currentRequest !== requestId.current) return;
        setState({ data: result.data, meta: result.meta, isLoading: false, error: null, page });
      } catch {
        if (currentRequest !== requestId.current) return;
        setState((s) => ({ ...s, isLoading: false, error: 'Erro ao carregar dados.' }));
      }
    },
    [fetcher, limit],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  const goToPage = (page: number) => void load(page);

  return { ...state, goToPage, reload: () => void load(state.page) };
}
