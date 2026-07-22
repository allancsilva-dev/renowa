import type { OrderStatus } from '@/types';

type PermissionCheck = (slug: string) => boolean;

/** Botão "Liberar pedido" — só a partir de `em_aberto` e com a permissão `pedidos.liberar`. */
export function canLiberarPedido(hasPermission: PermissionCheck, status: OrderStatus): boolean {
  return hasPermission('pedidos.liberar') && status === 'em_aberto';
}

/**
 * Botão "Cancelar pedido" — o backend só permite cancelar quando não há
 * nenhuma nota fiscal ativa vinculada. Como qualquer nota registrada já
 * move o pedido para `parcialmente_faturado`/`faturado`, restringir aos
 * status `em_aberto`/`liberado` reflete a mesma regra sem precisar de uma
 * chamada extra só para checar a contagem de notas.
 */
export function canCancelarPedido(hasPermission: PermissionCheck, status: OrderStatus): boolean {
  return hasPermission('pedidos.editar') && (status === 'em_aberto' || status === 'liberado');
}

/** Campos comerciais e itens do pedido só são editáveis enquanto `em_aberto` (mesma regra do backend). */
export function isPedidoLocked(status: OrderStatus): boolean {
  return status !== 'em_aberto';
}
