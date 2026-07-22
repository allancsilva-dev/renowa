import api from '@/lib/apiClient';
import type { ApiResponse, Product, PaginatedResponse } from '@/types';

export async function fetchProducts(params: {
  page?: number;
  limit?: number;
  search?: string;
  fornecedor_uuid?: string;
}): Promise<PaginatedResponse<Product>> {
  const { data } = await api.get<PaginatedResponse<Product>>('/produtos', { params });
  return data;
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
  erros: ImportProductRowError[];
}

/** Importação em massa de produtos (.csv/.xlsx) vinculados a um fornecedor. */
export async function importProducts(file: File, fornecedorUuid: string): Promise<ImportProductsResult> {
  const formData = new FormData();
  formData.append('arquivo', file);
  formData.append('fornecedor_uuid', fornecedorUuid);
  const { data } = await api.post<ApiResponse<ImportProductsResult>>('/produtos/importacao', formData);
  return data.data;
}
