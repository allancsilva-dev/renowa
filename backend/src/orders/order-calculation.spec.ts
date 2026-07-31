import { ORDER_ITEM_CASES, ORDER_TOTALS_CASES } from '@renowa/shared';
import { calculateOrderItem, calculateOrderTotals } from './order-calculation';

/**
 * Este é o lado autoritativo do cálculo. Os casos vivem em `@renowa/shared` e
 * são iterados aqui e em `frontend/src/lib/orderCalculation.test.ts` — antes os
 * números eram cópia manual, um caso de cada lado, e nenhum deles distinguia
 * "arredonda no unitário" de "arredonda no total da linha" (BACKLOG-0065).
 */
describe('cálculo definitivo de pedidos (fixture compartilhada)', () => {
  it.each(ORDER_ITEM_CASES.map((caso) => [caso.nome, caso] as const))(
    'item: %s',
    (_nome, caso) => {
      const item = calculateOrderItem(caso.entrada);
      expect(item).toMatchObject({
        qtd_total: caso.esperado.qtd_total,
        valor_com_desconto: caso.esperado.valor_com_desconto,
        valor_com_imposto: caso.esperado.valor_com_imposto,
        total_item_sem_imposto: caso.esperado.total_sem_imposto,
        total_item_com_imposto: caso.esperado.total_com_imposto,
      });
      if (caso.esperado_normalizado) {
        expect(item).toMatchObject(caso.esperado_normalizado);
      }
    },
  );

  it.each(ORDER_TOTALS_CASES.map((caso) => [caso.nome, caso] as const))(
    'totais: %s',
    (_nome, caso) => {
      const itens = caso.itens.map((entrada) => calculateOrderItem(entrada));
      expect(calculateOrderTotals(itens)).toEqual({
        valor_bruto: caso.esperado_backend!.valor_bruto,
        desconto_total: caso.esperado_backend!.desconto_total,
        total_sem_imposto: caso.esperado.total_sem_imposto,
        ipi_total: caso.esperado_backend!.ipi_total,
        total_com_imposto: caso.esperado.total_com_imposto,
      });
    },
  );
});

describe('cálculo definitivo de pedidos — bordas só do backend', () => {
  it('soma múltiplos itens sem float', () => {
    const rounded = calculateOrderItem({ qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '1.005' });
    const zero = calculateOrderItem({ qtd_caixas: 0, qtd_unitaria: 10, preco_unitario: 9999999999.99 });
    expect(calculateOrderTotals([rounded, zero]).total_com_imposto).toBe('1.01');
  });

  it('trata null como zero', () => {
    expect(calculateOrderItem({
      qtd_caixas: null, qtd_unitaria: null, preco_unitario: null, desconto_perc: null, ipi_perc: null,
    })).toMatchObject({ qtd_total: '0.000', total_item_sem_imposto: '0.00', total_item_com_imposto: '0.00' });
  });
});
