import api from '@/lib/apiClient';
import type { ApiResponse, PaginatedResponse, SacStatus, SacTicket } from '@/types';

export async function fetchSacTickets(params: {
  page?: number;
  limit?: number;
  status?: SacStatus;
  search?: string;
}): Promise<PaginatedResponse<SacTicket>> {
  const { data } = await api.get<PaginatedResponse<SacTicket>>('/sac', { params });
  return data;
}

export async function fetchSacTicket(uuid: string): Promise<SacTicket> {
  const { data } = await api.get<ApiResponse<SacTicket>>(`/sac/${uuid}`);
  return data.data;
}

export async function saveSacTicket(payload: Record<string, unknown>, uuid?: string): Promise<SacTicket> {
  const response = uuid
    ? await api.put<ApiResponse<SacTicket>>(`/sac/${uuid}`, payload)
    : await api.post<ApiResponse<SacTicket>>('/sac', payload);
  return response.data.data;
}

/** Transições válidas em `sacStatusTransitions`; o backend rejeita o resto com 409. */
export async function updateSacStatus(uuid: string, status: SacStatus, version: number): Promise<SacTicket> {
  const { data } = await api.patch<ApiResponse<SacTicket>>(`/sac/${uuid}/status`, { status, version });
  return data.data;
}

export async function deleteSacTicket(uuid: string, version: number): Promise<void> {
  await api.delete(`/sac/${uuid}`, { params: { version } });
}
