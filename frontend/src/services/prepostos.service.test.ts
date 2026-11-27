import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import { fetchVendedoresOpcoes, type VendedorOpcao } from './prepostos.service';

vi.mock('@/lib/apiClient', () => ({
  default: { get: vi.fn() },
}));

describe('fetchVendedoresOpcoes', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
  });

  it('desembrulha o envelope { data } da API e devolve a lista', async () => {
    // Regressão: a lista chega embrulhada pelo ResponseInterceptor. Ler o corpo
    // como array fazia o filtro "Vendedor" mostrar "Não foi possível carregar os resultados".
    const opcoes: VendedorOpcao[] = [
      { tipo: 'usuario', uuid: 'u1', nome: 'Ana' },
      { tipo: 'preposto', uuid: 'p1', nome: 'Paula' },
    ];
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: opcoes } });

    await expect(fetchVendedoresOpcoes({ search: 'a' })).resolves.toEqual(opcoes);
  });

  it('envia só a busca, sem período nem status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });

    await fetchVendedoresOpcoes({ search: 'Ana' });

    expect(apiClient.get).toHaveBeenCalledWith('/vendedores/comissoes/opcoes', { params: { search: 'Ana' } });
  });
});
