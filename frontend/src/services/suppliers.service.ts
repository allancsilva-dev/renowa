import api from '@/lib/apiClient';
import type { Supplier, PaginatedResponse, ApiResponse } from '@/types';

export type SupplierFormData = {
  uuid?: string;
  razao_social: string;
  cnpj?: string | null;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  telefone?: string | null;
  inscricao_estadual?: string | null;
};

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

export async function createSupplier(payload: SupplierFormData): Promise<Supplier> {
  const { data } = await api.post<ApiResponse<Supplier>>('/fornecedores', payload);
  return data.data;
}

export async function updateSupplier(uuid: string, payload: Partial<SupplierFormData>): Promise<Supplier> {
  const { data } = await api.patch<ApiResponse<Supplier>>(`/fornecedores/${uuid}`, payload);
  return data.data;
}

export async function deleteSupplier(uuid: string): Promise<void> {
  await api.delete(`/fornecedores/${uuid}`);
}

