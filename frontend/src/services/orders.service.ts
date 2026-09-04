import api from '@/lib/apiClient';
import type { Order, PaginatedResponse, ApiResponse, OrderStatus, OrderOrigem } from '@/types';

export async function fetchOrders(params: {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  search?: string;
  origem?: OrderOrigem;
}): Promise<PaginatedResponse<Order>> {
  const { data } = await api.get<PaginatedResponse<Order>>('/pedidos', { params });
  return data;
}

export async function fetchOrder(uuid: string): Promise<Order> {
  const { data } = await api.get<ApiResponse<Order>>(`/pedidos/${uuid}`);
  return data.data;
}

/** Único status aceito por este endpoint é 'cancelado' — liberação usa `liberarOrder`. */
export async function updateOrderStatus(uuid: string, status: OrderStatus, version: number): Promise<Order> {
  const { data } = await api.patch<ApiResponse<Order>>(`/pedidos/${uuid}/status`, { status, version });
  return data.data;
}

/** Libera o pedido (`em_aberto` → `liberado`) — requer permissão `pedidos.liberar`. */
export async function liberarOrder(uuid: string, version: number): Promise<Order> {
  const { data } = await api.patch<ApiResponse<Order>>(`/pedidos/${uuid}/liberar`, { version });
  return data.data;
}

export async function saveOrder(payload: Record<string, unknown>, uuid?: string): Promise<Order> {
  const response = uuid
    ? await api.put<ApiResponse<Order>>(`/pedidos/${uuid}`, payload)
    : await api.post<ApiResponse<Order>>('/pedidos', payload);
  return response.data.data;
}

/** Cria novo pedido interno e copia, no servidor, fotos específicas do pedido fonte. */
export async function duplicateOrder(sourceUuid: string, payload: Record<string, unknown>): Promise<Order> {
  const { data } = await api.post<ApiResponse<Order>>(`/pedidos/${sourceUuid}/duplicar`, payload);
  return data.data;
}

/**
 * Pedido externo tem rota própria: o corpo é outro (sem itens, com número de
 * origem, sistema e valor). O backend recusa com 409 se a rota não bater com a
 * origem do pedido.
 */
export async function saveExternalOrder(payload: Record<string, unknown>, uuid?: string): Promise<Order> {
  const response = uuid
    ? await api.put<ApiResponse<Order>>(`/pedidos/externos/${uuid}`, payload)
    : await api.post<ApiResponse<Order>>('/pedidos/externos', payload);
  return response.data.data;
}
