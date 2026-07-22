import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from './apiClient';
import { fetchAllPages } from './fetchAllPages';

vi.mock('./apiClient', () => ({
  default: { get: vi.fn() },
}));

describe('fetchAllPages', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('concatena todas as páginas e preserva filtros', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: { data: [{ id: 1 }], meta: { total: 3, page: 1, limit: 100, totalPages: 3 } },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 2 }], meta: { total: 3, page: 2, limit: 100, totalPages: 3 } },
      })
      .mockResolvedValueOnce({
        data: { data: [{ id: 3 }], meta: { total: 3, page: 3, limit: 100, totalPages: 3 } },
      });

    await expect(fetchAllPages<{ id: number }>('/produtos', { fornecedor_uuid: 'fornecedor-1' }))
      .resolves.toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(apiClient.get).toHaveBeenNthCalledWith(1, '/produtos', {
      params: { fornecedor_uuid: 'fornecedor-1', page: 1, limit: 100 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/produtos', {
      params: { fornecedor_uuid: 'fornecedor-1', page: 2, limit: 100 },
    });
    expect(apiClient.get).toHaveBeenNthCalledWith(3, '/produtos', {
      params: { fornecedor_uuid: 'fornecedor-1', page: 3, limit: 100 },
    });
  });
});
