import api from '@/lib/apiClient';
import type { Supplier, PaginatedResponse, ApiResponse } from '@/types';

export async function fetchSuppliers(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<PaginatedResponse<Supplier>> {
  const { data } = await api.get<PaginatedResponse<Supplier>>('/fornecedores', { params });
  return data;
}

export async function fetchSupplier(uuid: string): Promise<Supplier> {
  const { data } = await api.get<ApiResponse<Supplier>>(`/fornecedores/${uuid}`);
  return data.data;
}
