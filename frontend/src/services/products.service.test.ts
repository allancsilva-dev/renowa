import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import type { Product } from '@/types';
import {
  FotoDoProdutoNaoEnviadaError,
  importProducts,
  salvarProdutoNovo,
  type ImportProductsResult,
} from './products.service';
import { uploadProductPhoto } from './productPhotos.service';

vi.mock('@/lib/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

vi.mock('./productPhotos.service', () => ({ uploadProductPhoto: vi.fn() }));

describe('importProducts', () => {
  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
  });

  it('envia o arquivo e o fornecedor_uuid como multipart/form-data', async () => {
    const result: ImportProductsResult = { criados: 2, atualizados: 1, rejeitados: 1, fotosCriadas: 1, fotosIgnoradas: 0, erros: [{ linha: 4, codigo: 'X1', erro: 'Código duplicado no arquivo' }] };
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
      fotosCriadas: 0,
      fotosIgnoradas: 0,
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

/**
 * A criação de produto tem dois passos que falham de formas opostas, e tratá-los
 * como um só foi o que produzia produto duplicado: o POST passava, o upload da
 * foto falhava, a tela mostrava erro sem dizer que o produto já existia, e o
 * segundo clique refazia o cadastro inteiro.
 */
describe('salvarProdutoNovo', () => {
  const uuid = 'e8f0d0c9-1b7a-4a1e-9d6c-2b0f5a3c7d11';
  const produto = { uuid, descricao: 'Produto A' } as Product;
  const foto = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });

  beforeEach(() => {
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(uploadProductPhoto).mockReset();
  });

  it('cria com o uuid recebido — a identidade vem de fora, não é sorteada aqui', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: produto } });

    await expect(salvarProdutoNovo({
      uuid, payload: { descricao: 'Produto A' }, foto: null, jaCriado: false,
    })).resolves.toEqual(produto);

    expect(apiClient.post).toHaveBeenCalledWith('/produtos', { descricao: 'Produto A', uuid });
    expect(uploadProductPhoto).not.toHaveBeenCalled();
  });

  it('sobe a foto depois de criar, com o mesmo uuid', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: produto } });
    vi.mocked(uploadProductPhoto).mockResolvedValue({} as never);

    await salvarProdutoNovo({ uuid, payload: {}, foto, jaCriado: false });

    expect(uploadProductPhoto).toHaveBeenCalledWith(uuid, foto);
  });

  it('POST falho não sobe foto e não vira erro de foto — nada foi criado', async () => {
    const falha = new Error('rede');
    vi.mocked(apiClient.post).mockRejectedValue(falha);

    await expect(salvarProdutoNovo({ uuid, payload: {}, foto, jaCriado: false }))
      .rejects.toBe(falha);
    expect(uploadProductPhoto).not.toHaveBeenCalled();
  });

  it('foto falha depois do POST: erro carrega o produto JÁ criado', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: produto } });
    const causa = new Error('413');
    vi.mocked(uploadProductPhoto).mockRejectedValue(causa);

    const erro = await salvarProdutoNovo({ uuid, payload: {}, foto, jaCriado: false })
      .catch((reason: unknown) => reason);

    expect(erro).toBeInstanceOf(FotoDoProdutoNaoEnviadaError);
    expect((erro as FotoDoProdutoNaoEnviadaError).produto).toEqual(produto);
    expect((erro as FotoDoProdutoNaoEnviadaError).causa).toBe(causa);
  });

  // O ponto do P1-1: a segunda tentativa não pode recriar o produto.
  it('com jaCriado, atualiza em vez de criar de novo', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: produto } });
    vi.mocked(uploadProductPhoto).mockResolvedValue({} as never);

    await salvarProdutoNovo({
      uuid, payload: { descricao: 'Corrigido' }, foto, jaCriado: true,
    });

    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.patch).toHaveBeenCalledWith(`/produtos/${uuid}`, { descricao: 'Corrigido' });
    expect(uploadProductPhoto).toHaveBeenCalledWith(uuid, foto);
  });
});
