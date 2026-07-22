import api from '@/lib/apiClient';
import type { ApiResponse, Order, PaginatedResponse } from '@/types';

export interface NotaFiscal {
  uuid: string;
  version: number;
  pedido_id: number;
  numero_nota: string;
  serie: string | null;
  valor: string;
  data_emissao: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface FaturamentoPedidoRow {
  uuid: string;
  numero_pedido: number | null;
  status: string;
  cliente: string | null;
  fornecedor: string | null;
  valor: string;
  total_faturado: string;
  divergencia: string;
}

export interface FaturamentoPedidoDetalhe extends Order {
  notas: NotaFiscal[];
  valor: string;
  total_faturado: string;
  divergencia: string;
}

export async function fetchFaturamentoPedidos(params: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<FaturamentoPedidoRow>> {
  const { data } = await api.get<PaginatedResponse<FaturamentoPedidoRow>>('/faturamento/pedidos', { params });
  return data;
}

export async function fetchFaturamentoPedidoDetalhe(uuid: string): Promise<FaturamentoPedidoDetalhe> {
  const { data } = await api.get<ApiResponse<FaturamentoPedidoDetalhe>>(`/faturamento/pedidos/${uuid}`);
  return data.data;
}

export interface CreateNotaFiscalPayload {
  uuid: string;
  numero_nota: string;
  serie?: string | null;
  valor: number;
  data_emissao?: string | null;
  observacao?: string | null;
}

export async function registrarNota(pedidoUuid: string, payload: CreateNotaFiscalPayload): Promise<NotaFiscal> {
  const { data } = await api.post<ApiResponse<NotaFiscal>>(`/faturamento/pedidos/${pedidoUuid}/notas`, payload);
  return data.data;
}

export interface UpdateNotaFiscalPayload {
  version: number;
  numero_nota?: string;
  serie?: string | null;
  valor?: number;
  data_emissao?: string | null;
  observacao?: string | null;
}

export async function atualizarNota(uuid: string, payload: UpdateNotaFiscalPayload): Promise<NotaFiscal> {
  const { data } = await api.patch<ApiResponse<NotaFiscal>>(`/faturamento/notas/${uuid}`, payload);
  return data.data;
}

export async function excluirNota(uuid: string, version: number): Promise<void> {
  await api.delete(`/faturamento/notas/${uuid}`, { params: { version } });
}
