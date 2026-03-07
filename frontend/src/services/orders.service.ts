import api from './axiosInstance';
import type { Order, PaginatedResponse, ApiResponse, OrderStatus } from '@/types';

export async function fetchOrders(params: {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}): Promise<PaginatedResponse<Order>> {
  const { data } = await api.get<PaginatedResponse<Order>>('/pedidos', { params });
  return data;
}

export async function fetchOrder(uuid: string): Promise<Order> {
  const { data } = await api.get<ApiResponse<Order>>(`/pedidos/${uuid}`);
  return data.data;
}

export async function updateOrderStatus(uuid: string, status: OrderStatus): Promise<Order> {
  const { data } = await api.patch<ApiResponse<Order>>(`/pedidos/${uuid}/status`, { status });
  return data.data;
}
