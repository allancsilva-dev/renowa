import api from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse, Preposto } from '@/types';

export interface PrepostoPayload {
  nome: string;
  documento: string | null;
  telefone: string | null;
  email: string | null;
  endereco_completo: string | null;
  percentual_comissao: number;
}

export async function fetchPrepostos(params: { page?: number; limit?: number; search?: string }): Promise<PaginatedResponse<Preposto>> {
  const { data } = await api.get<PaginatedResponse<Preposto>>('/prepostos', { params });
  return data;
}

export async function createPreposto(payload: PrepostoPayload & { uuid: string }): Promise<Preposto> {
  const { data } = await api.post<ApiResponse<Preposto>>('/prepostos', payload);
  return data.data;
}

export async function updatePreposto(uuid: string, payload: PrepostoPayload & { version: number }): Promise<Preposto> {
  const { data } = await api.patch<ApiResponse<Preposto>>(`/prepostos/${uuid}`, payload);
  return data.data;
}

export async function deletePreposto(uuid: string, version: number): Promise<void> {
  await api.delete(`/prepostos/${uuid}`, { params: { version } });
}
