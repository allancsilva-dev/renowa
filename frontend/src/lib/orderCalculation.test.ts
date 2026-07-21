import { describe, expect, it } from 'vitest';
import { previewItem, previewOrder } from './orderCalculation';

describe('prévia de cálculo do pedido', () => {
  it('espelha o contrato autoritativo do backend', () => {
    const input = { qtd_caixas: 3, qtd_unitaria: 10, preco_unitario: 100, desconto_perc: 10, ipi_perc: 5 };
    expect(previewItem(input)).toEqual({
      qtd_total: '30.000', valor_com_desconto: '90.00', valor_com_imposto: '94.50',
      total_sem_imposto: '2700.00', total_com_imposto: '2835.00',
    });
    expect(previewOrder([input])).toEqual({ semImposto: '2700.00', comImposto: '2835.00' });
  });
});
