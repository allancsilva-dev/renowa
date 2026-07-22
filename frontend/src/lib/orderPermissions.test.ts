import { describe, expect, it } from 'vitest';
import { canCancelarPedido, canLiberarPedido, isPedidoLocked } from './orderPermissions';

const grant = (slugs: string[]) => (slug: string) => slugs.includes(slug);

describe('canLiberarPedido', () => {
  it('permite liberar apenas quando em_aberto e com a permissão pedidos.liberar', () => {
    expect(canLiberarPedido(grant(['pedidos.liberar']), 'em_aberto')).toBe(true);
  });

  it('bloqueia sem a permissão pedidos.liberar mesmo em_aberto', () => {
    expect(canLiberarPedido(grant([]), 'em_aberto')).toBe(false);
  });

  it('bloqueia quando o pedido já não está mais em_aberto', () => {
    expect(canLiberarPedido(grant(['pedidos.liberar']), 'liberado')).toBe(false);
    expect(canLiberarPedido(grant(['pedidos.liberar']), 'faturado')).toBe(false);
    expect(canLiberarPedido(grant(['pedidos.liberar']), 'cancelado')).toBe(false);
  });
});

describe('canCancelarPedido', () => {
  it('permite cancelar em_aberto ou liberado com a permissão pedidos.editar', () => {
    expect(canCancelarPedido(grant(['pedidos.editar']), 'em_aberto')).toBe(true);
    expect(canCancelarPedido(grant(['pedidos.editar']), 'liberado')).toBe(true);
  });

  it('bloqueia quando já há faturamento (parcialmente_faturado/faturado)', () => {
    expect(canCancelarPedido(grant(['pedidos.editar']), 'parcialmente_faturado')).toBe(false);
    expect(canCancelarPedido(grant(['pedidos.editar']), 'faturado')).toBe(false);
  });

  it('bloqueia sem a permissão pedidos.editar', () => {
    expect(canCancelarPedido(grant([]), 'em_aberto')).toBe(false);
  });
});

describe('isPedidoLocked', () => {
  it('só fica destravado em em_aberto', () => {
    expect(isPedidoLocked('em_aberto')).toBe(false);
    expect(isPedidoLocked('liberado')).toBe(true);
    expect(isPedidoLocked('parcialmente_faturado')).toBe(true);
    expect(isPedidoLocked('faturado')).toBe(true);
    expect(isPedidoLocked('cancelado')).toBe(true);
  });
});
