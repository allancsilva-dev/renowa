import { describe, expect, it } from 'vitest';
import { itensComProdutoDistinto } from './orderItemPhotos';
import type { Order, OrderItem } from '@/types';

function item(uuid: string, produtoUuid?: string): OrderItem {
  return {
    uuid,
    produto: produtoUuid ? ({ uuid: produtoUuid } as OrderItem['produto']) : null,
  } as OrderItem;
}

const order = (itens: OrderItem[]) => ({ itens } as Order);

describe('itensComProdutoDistinto', () => {
  /**
   * A foto é do produto, então dois itens do mesmo produto imprimem a mesma
   * imagem — e não podem virar dois downloads.
   */
  it('devolve um item por produto distinto', () => {
    const resultado = itensComProdutoDistinto(order([
      item('i1', 'p1'),
      item('i2', 'p2'),
      item('i3', 'p1'),
    ]));

    expect(resultado.map((i) => i.uuid)).toEqual(['i1', 'i2']);
  });

  // Item manual não tem produto cadastrado: a célula do papel sai vazia e não
  // há o que baixar.
  it('ignora item sem produto', () => {
    const resultado = itensComProdutoDistinto(order([item('i1'), item('i2', 'p1')]));

    expect(resultado.map((i) => i.uuid)).toEqual(['i2']);
  });

  it('preserva a ordem dos itens', () => {
    const resultado = itensComProdutoDistinto(order([
      item('i1', 'p2'),
      item('i2', 'p1'),
    ]));

    expect(resultado.map((i) => i.produto?.uuid)).toEqual(['p2', 'p1']);
  });

  it('pedido sem itens devolve lista vazia', () => {
    expect(itensComProdutoDistinto(order([]))).toEqual([]);
    expect(itensComProdutoDistinto({} as Order)).toEqual([]);
  });
});
