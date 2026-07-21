import { calculateOrderItem, calculateOrderTotals } from './order-calculation';

describe('cálculo definitivo de pedidos', () => {
  it('reproduz a fórmula de referência da planilha', () => {
    const item = calculateOrderItem({
      qtd_caixas: 3,
      qtd_unitaria: 10,
      preco_unitario: 100,
      desconto_perc: 10,
      ipi_perc: 5,
    });

    expect(item).toMatchObject({
      qtd_total: '30.000',
      valor_com_desconto: '90.00',
      valor_com_imposto: '94.50',
      total_item_sem_imposto: '2700.00',
      total_item_com_imposto: '2835.00',
    });
    expect(calculateOrderTotals([item])).toEqual({
      valor_bruto: '3000.00',
      desconto_total: '300.00',
      total_sem_imposto: '2700.00',
      ipi_total: '135.00',
      total_com_imposto: '2835.00',
    });
  });

  it('usa ROUND_HALF_UP, aceita zero e soma múltiplos itens sem float', () => {
    const rounded = calculateOrderItem({ qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '1.005' });
    const zero = calculateOrderItem({ qtd_caixas: 0, qtd_unitaria: 10, preco_unitario: 9999999999.99 });
    expect(rounded.preco_unitario).toBe('1.01');
    expect(rounded.total_item_sem_imposto).toBe('1.01');
    expect(zero.total_item_com_imposto).toBe('0.00');
    expect(calculateOrderTotals([rounded, zero]).total_com_imposto).toBe('1.01');
  });
});
