import api from '@/lib/apiClient';
import type { Order, PaginatedResponse, ApiResponse, OrderStatus } from '@/types';

export async function fetchOrders(params: {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  search?: string;
}): Promise<PaginatedResponse<Order>> {
  const { data } = await api.get<PaginatedResponse<Order>>('/pedidos', { params });
  return data;
}

export async function fetchOrder(uuid: string): Promise<Order> {
  const { data } = await api.get<ApiResponse<Order>>(`/pedidos/${uuid}`);
  return data.data;
}

export async function updateOrderStatus(uuid: string, status: OrderStatus, version: number): Promise<Order> {
  const { data } = await api.patch<ApiResponse<Order>>(`/pedidos/${uuid}/status`, { status, version });
  return data.data;
}

export async function saveOrder(payload: Record<string, unknown>, uuid?: string): Promise<Order> {
  const response = uuid
    ? await api.put<ApiResponse<Order>>(`/pedidos/${uuid}`, payload)
    : await api.post<ApiResponse<Order>>('/pedidos', payload);
  return response.data.data;
}
