import apiClient from '@/lib/apiClient';
import { normalizeListResponse } from '@/lib/pagination';

const PAGE_SIZE = 100;

/**
 * Busca uma listagem paginada inteira, em lotes de 100 (teto do backend),
 * concatenando todas as páginas até meta.totalPages. Retorna a lista completa,
 * sem truncar. Para telas com paginação real, use o serviço paginado direto.
 */
export async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number | boolean | null | undefined> = {},
): Promise<T[]> {
  const first = await apiClient.get<unknown>(path, { params: { ...params, page: 1, limit: PAGE_SIZE } });
  const { items, meta } = normalizeListResponse<T>(first.data, 1, PAGE_SIZE);
  const all = [...items];
  for (let page = 2; page <= meta.totalPages; page++) {
    const res = await apiClient.get<unknown>(path, { params: { ...params, page, limit: PAGE_SIZE } });
    all.push(...normalizeListResponse<T>(res.data, page, PAGE_SIZE).items);
  }
  return all;
}
