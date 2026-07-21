import api from '@/lib/apiClient';
import type { Product, PaginatedResponse } from '@/types';

export async function fetchProducts(params: {
  page?: number;
  limit?: number;
  search?: string;
  fornecedor_uuid?: string;
}): Promise<PaginatedResponse<Product>> {
  const { data } = await api.get<PaginatedResponse<Product>>('/produtos', { params });
  return data;
}
