import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import { importProducts, type ImportProductsResult } from './products.service';

vi.mock('@/lib/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

describe('importProducts', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('envia o arquivo e o fornecedor_uuid como multipart/form-data', async () => {
    const result: ImportProductsResult = { criados: 2, atualizados: 1, rejeitados: 1, erros: [{ linha: 4, codigo: 'X1', erro: 'Código duplicado no arquivo' }] };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: result } });

    const file = new File(['codigo,descricao\nA1,Produto A'], 'produtos.csv', { type: 'text/csv' });
    await expect(importProducts(file, 'fornecedor-uuid-1')).resolves.toEqual(result);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body] = vi.mocked(apiClient.post).mock.calls[0];
    expect(url).toBe('/produtos/importacao');
    expect(body).toBeInstanceOf(FormData);
    const formData = body as FormData;
    expect(formData.get('arquivo')).toBe(file);
    expect(formData.get('fornecedor_uuid')).toBe('fornecedor-uuid-1');
  });

  it('repassa o resumo de criados/atualizados/rejeitados e a lista de erros por linha', async () => {
    const result: ImportProductsResult = {
      criados: 0,
      atualizados: 0,
      rejeitados: 3,
      erros: [
        { linha: 2, codigo: '', erro: 'Código obrigatório' },
        { linha: 3, codigo: 'B2', erro: 'Código duplicado no arquivo' },
        { linha: 5, codigo: 'C3', erro: 'Fornecedor inválido' },
      ],
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: result } });

    const file = new File(['x'], 'produtos.csv');
    await expect(importProducts(file, 'fornecedor-uuid-2')).resolves.toEqual(result);
  });
});
