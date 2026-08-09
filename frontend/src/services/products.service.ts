import api from '@/lib/apiClient';
import type { ApiResponse, Product, PaginatedResponse } from '@/types';
import { uploadProductPhoto } from '@/services/productPhotos.service';

export async function fetchProducts(params: {
  page?: number;
  limit?: number;
  search?: string;
  fornecedor_uuid?: string;
}): Promise<PaginatedResponse<Product>> {
  const { data } = await api.get<PaginatedResponse<Product>>('/produtos', { params });
  return data;
}

/**
 * O produto foi salvo, mas a foto não subiu.
 *
 * Existe para separar as duas falhas que a tela precisa tratar de formas
 * opostas: se o POST falhou, nada foi criado e retentar é o certo; se o POST
 * passou e só o upload falhou, o produto JÁ ESTÁ no catálogo e retentar a
 * criação inteira é o que produzia duplicata. Carrega o produto criado para a
 * tela poder oferecer "tentar só a foto" ou "continuar sem a foto".
 */
export class FotoDoProdutoNaoEnviadaError extends Error {
  constructor(readonly produto: Product, readonly causa: unknown) {
    super('O produto foi salvo, mas a foto não pôde ser enviada.');
    this.name = 'FotoDoProdutoNaoEnviadaError';
  }
}

export interface SalvarProdutoNovoInput {
  /** Estável entre tentativas — ver `useUuidDeCriacao`. É a chave de idempotência. */
  uuid: string;
  payload: Record<string, unknown>;
  foto: File | null;
  /**
   * Uma tentativa anterior já criou o produto. Aqui o passo de criação vira
   * PATCH: o usuário pode ter corrigido um campo antes de tentar de novo, e o
   * POST não deve ser repetido nem para ser recusado.
   */
  jaCriado: boolean;
}

/**
 * Criação de produto com foto, em dois passos que falham de formas diferentes.
 *
 * A ordem é obrigatória: o produto precisa existir para a foto ter onde ser
 * pendurada (o `PUT` é por uuid de produto). Por isso a falha do segundo passo
 * não pode ser tratada como falha do primeiro.
 */
export async function salvarProdutoNovo(input: SalvarProdutoNovoInput): Promise<Product> {
  const { data } = input.jaCriado
    ? await api.patch<ApiResponse<Product>>(`/produtos/${input.uuid}`, input.payload)
    : await api.post<ApiResponse<Product>>('/produtos', { ...input.payload, uuid: input.uuid });
  const produto = data.data;

  if (!input.foto) return produto;

  try {
    await uploadProductPhoto(input.uuid, input.foto);
  } catch (causa) {
    throw new FotoDoProdutoNaoEnviadaError(produto, causa);
  }
  return produto;
}

export interface ImportProductRowError {
  linha: number;
  codigo: string;
  erro: string;
}

export interface ImportProductsResult {
  criados: number;
  atualizados: number;
  rejeitados: number;
  fotosCriadas: number;
  fotosIgnoradas: number;
  erros: ImportProductRowError[];
}

/** Importação em massa de produtos (.csv ou .xlsx) vinculados a um fornecedor. */
export async function importProducts(file: File, fornecedorUuid: string): Promise<ImportProductsResult> {
  const formData = new FormData();
  formData.append('arquivo', file);
  formData.append('fornecedor_uuid', fornecedorUuid);
  const { data } = await api.post<ApiResponse<ImportProductsResult>>('/produtos/importacao', formData);
  return data.data;
}

export async function downloadProductsXlsxTemplate(): Promise<void> {
  const { data } = await api.getBlob('/produtos/importacao/modelo.xlsx');
  const url = URL.createObjectURL(data); const link = document.createElement('a');
  link.href = url; link.download = 'modelo-produtos.xlsx'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
