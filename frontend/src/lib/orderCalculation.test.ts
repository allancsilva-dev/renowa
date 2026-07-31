import { describe, expect, it } from 'vitest';
import { ORDER_ITEM_CASES, ORDER_TOTALS_CASES } from '@renowa/shared';
import { previewItem, previewOrder } from './orderCalculation';

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
