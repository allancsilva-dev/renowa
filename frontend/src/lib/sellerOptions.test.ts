import { describe, expect, it, vi } from 'vitest';

const fetchPrepostos = vi.fn();
vi.mock('@/services/prepostos.service', () => ({ fetchPrepostos: (...args: unknown[]) => fetchPrepostos(...args) }));

const { sellerOptionsFetcher, sellerValue, splitSellerValue } = await import('./relationOptions');

describe('campo Vendedor: usuários + prepostos', () => {
  it('separa o valor do combobox no campo certo do payload', () => {
    expect(splitSellerValue('preposto:abc')).toEqual({ vendedor_uuid: '', preposto_uuid: 'abc' });
    expect(splitSellerValue('user-uuid')).toEqual({ vendedor_uuid: 'user-uuid', preposto_uuid: '' });
    expect(splitSellerValue(null)).toEqual({ vendedor_uuid: '', preposto_uuid: '' });
    expect(sellerValue({ vendedor_uuid: 'u', preposto_uuid: 'p' })).toBe('preposto:p');
    expect(sellerValue({ vendedor_uuid: '', preposto_uuid: '' })).toBeNull();
  });

  it('sem permissão de prepostos não consulta a API', async () => {
    const result = await sellerOptionsFetcher([{ value: 'u1', label: 'Ana' }], false)('', 1);
    expect(fetchPrepostos).not.toHaveBeenCalled();
    expect(result.options).toEqual([{ value: 'u1', label: 'Ana' }]);
  });

  it('falha ao buscar prepostos mantém os usuários', async () => {
    fetchPrepostos.mockRejectedValueOnce(new Error('403'));
    const result = await sellerOptionsFetcher([{ value: 'u1', label: 'Ana' }], true)('an', 1);
    expect(result.options.map((o) => o.value)).toEqual(['u1']);
  });

  it('acrescenta prepostos com prefixo e rótulo próprio', async () => {
    fetchPrepostos.mockResolvedValueOnce({ data: [{ uuid: 'p1', nome: 'Paula' }], meta: { page: 1, totalPages: 2 } });
    const result = await sellerOptionsFetcher([], true)(' pa ', 1);
    expect(fetchPrepostos).toHaveBeenLastCalledWith({ search: 'pa', page: 1, limit: 20 });
    expect(result).toEqual({ options: [{ value: 'preposto:p1', label: 'Paula · Preposto' }], hasMore: true });
  });
});
