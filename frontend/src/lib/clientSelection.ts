export interface ClientSelectionLike {
  pgt_padrao?: string | null;
  local_entrega?: string | null;
  transportadora?: { uuid: string } | null;
}

export interface OrderHeaderCommercialFields {
  pgt: string;
  local_entrega: string;
  transportadora_uuid: string;
}

/**
 * Mescla os dados do cliente selecionado no cabeçalho comercial do pedido
 * (`PedidoForm.tsx`).
 *
 * Decisão de negócio (Fase 4): `prazo` NÃO é mais herdado do cliente — o
 * campo permanece com o que o vendedor já tiver digitado manualmente.
 * Pagamento, local de entrega e transportadora continuam sendo copiados
 * quando o cliente tiver esses dados preenchidos.
 */
export function applyClientToOrderHeader<T extends OrderHeaderCommercialFields>(
  current: T,
  client: ClientSelectionLike | undefined,
): T {
  return {
    ...current,
    pgt: client?.pgt_padrao ?? current.pgt,
    local_entrega: client?.local_entrega ?? current.local_entrega,
    transportadora_uuid: client?.transportadora?.uuid ?? current.transportadora_uuid,
  };
}
