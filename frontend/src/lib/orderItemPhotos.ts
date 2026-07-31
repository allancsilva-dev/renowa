import type { Order, OrderItem } from '@/types';

/**
 * Itens do pedido que rendem foto no papel — um por PRODUTO distinto.
 *
 * A foto é do produto do catálogo, então dois itens do mesmo produto imprimem a
 * mesma imagem e não podem virar dois downloads. Item manual (sem produto
 * cadastrado) não entra: não há de onde puxar foto, e a célula sai vazia.
 *
 * Mora fora do componente de PDF porque quem EMITE o papel usa esta função para
 * decidir o que baixar: se as duas decisões divergirem, o papel pede uma foto
 * que ninguém baixou. Substituiu `orderPaperPhotos.ts`, que tinha a mesma razão
 * de existir quando a foto ainda era do pedido.
 */
export function itensComProdutoDistinto(order: Order): OrderItem[] {
  const vistos = new Set<string>();
  const representantes: OrderItem[] = [];
  for (const item of order.itens ?? []) {
    const produtoUuid = item.produto?.uuid;
    if (!produtoUuid || vistos.has(produtoUuid)) continue;
    vistos.add(produtoUuid);
    representantes.push(item);
  }
  return representantes;
}
