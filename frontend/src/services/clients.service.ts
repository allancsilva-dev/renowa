import api from '@/lib/apiClient';
import type { Client, PaginatedResponse, ApiResponse, ClientFormData, CnpjLookupResult } from '@/types';

export async function fetchClients(params: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<PaginatedResponse<Client>> {
  const { data } = await api.get<PaginatedResponse<Client>>('/clientes', { params });
  return data;
}

export async function fetchClient(uuid: string): Promise<Client> {
  const { data } = await api.get<ApiResponse<Client>>(`/clientes/${uuid}`);
  return data.data;
}

export async function createClient(payload: ClientFormData): Promise<Client> {
  const { data } = await api.post<ApiResponse<Client>>('/clientes', payload);
  return data.data;
}

export async function updateClient(uuid: string, payload: Partial<ClientFormData>): Promise<Client> {
  const { data } = await api.patch<ApiResponse<Client>>(`/clientes/${uuid}`, payload);
  return data.data;
}

export async function deleteClient(uuid: string): Promise<void> {
  await api.delete(`/clientes/${uuid}`);
}

/**
 * Consulta de apoio ao preenchimento do formulário — sem RBAC própria,
 * apenas autenticação (decisão confirmada). 404 (CNPJ não encontrado) e 503
 * (serviço indisponível) devem ser tratados pelo chamador como falha não
 * bloqueante — os campos continuam editáveis manualmente.
 */
export async function lookupCnpj(cnpj: string, options?: { signal?: AbortSignal }): Promise<CnpjLookupResult> {
  const { data } = await api.get<ApiResponse<CnpjLookupResult>>(`/consultas/cnpj/${cnpj}`, { signal: options?.signal });
  return data.data;
}
