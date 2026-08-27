import { describe, expect, it } from 'vitest';
import { ORDER_ITEM_CASES, ORDER_TOTALS_CASES } from '@renowa/shared';
import { orderTotalsBreakdown, previewItem, previewOrder } from './orderCalculation';

/**
 * Esta é a prévia da tela; o contrato autoritativo é
 * `backend/src/orders/order-calculation.ts`. Os casos vivem em `@renowa/shared`
 * e são iterados pelos dois lados — antes os números eram cópia manual e uma
 * divergência de arredondamento passaria pelas duas suítes verdes.
 */
describe('prévia de cálculo do pedido (fixture compartilhada)', () => {
  it.each(ORDER_ITEM_CASES.map((caso) => [caso.nome, caso] as const))(
    'item: %s',
    (_nome, caso) => {
      expect(previewItem(caso.entrada)).toEqual({
        qtd_total: caso.esperado.qtd_total,
        valor_com_desconto: caso.esperado.valor_com_desconto,
        valor_com_imposto: caso.esperado.valor_com_imposto,
        total_sem_imposto: caso.esperado.total_sem_imposto,
        total_com_imposto: caso.esperado.total_com_imposto,
      });
    },
  );

  it.each(ORDER_TOTALS_CASES.map((caso) => [caso.nome, caso] as const))(
    'totais: %s',
    (_nome, caso) => {
      expect(previewOrder([...caso.itens])).toEqual({
        semImposto: caso.esperado.total_sem_imposto,
        comImposto: caso.esperado.total_com_imposto,
      });
    },
  );
});

describe('prévia de cálculo do pedido — bordas da tela', () => {
  it('campo vazio do formulário vale zero', () => {
    expect(previewItem({ qtd_caixas: '', qtd_unitaria: '', preco_unitario: null, desconto_perc: '', ipi_perc: '' }))
      .toEqual({
        qtd_total: '0.000', valor_com_desconto: '0.00', valor_com_imposto: '0.00',
        total_sem_imposto: '0.00', total_com_imposto: '0.00',
      });
  });
});

describe('orderTotalsBreakdown', () => {
  it('deriva desconto e IPI por diferença, como o papel', () => {
    // Pedido nº 1 de produção: 72 × 48,00 = 3.456,00 bruto, 5% de desconto.
    expect(orderTotalsBreakdown(
      { total_sem_imposto: '3283.20', total_com_imposto: '3283.20' },
      [{ qtd_total: '72.000', preco_unitario: '48.00' }],
    )).toEqual({
      bruto: '3456.00',
      descontoTotal: '172.80',
      semImposto: '3283.20',
      ipiTotal: '0.00',
      comImposto: '3283.20',
    });
  });

  it('separa IPI do desconto quando os dois incidem', () => {
    expect(orderTotalsBreakdown(
      { total_sem_imposto: '183.60', total_com_imposto: '201.96' },
      [{ qtd_total: '4.000', preco_unitario: '25.50' }, { qtd_total: '4.000', preco_unitario: '25.50' }],
    )).toEqual({
      bruto: '204.00',
      descontoTotal: '20.40',
      semImposto: '183.60',
      ipiTotal: '18.36',
      comImposto: '201.96',
    });
  });

  it('devolve zeros para pedido sem itens (externo)', () => {
    expect(orderTotalsBreakdown({ total_sem_imposto: null, total_com_imposto: '900.00' }, []))
      .toEqual({ bruto: '0.00', descontoTotal: '0.00', semImposto: '0.00', ipiTotal: '900.00', comImposto: '900.00' });
  });
});
