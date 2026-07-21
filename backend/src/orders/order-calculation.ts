import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface OrderCalculationInput {
  qtd_caixas?: number | string | null;
  qtd_unitaria?: number | string | null;
  preco_unitario?: number | string | null;
  desconto_perc?: number | string | null;
  ipi_perc?: number | string | null;
}

export interface OrderItemCalculation {
  qtd_caixas: string;
  qtd_unitaria: string;
  qtd_total: string;
  preco_unitario: string;
  desconto_perc: string;
  valor_com_desconto: string;
  ipi_perc: string;
  valor_com_imposto: string;
  total_item_sem_imposto: string;
  total_item_com_imposto: string;
}

const quantity = (value: Decimal.Value | null | undefined) =>
  new Decimal(value ?? 0).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
const money = (value: Decimal.Value | null | undefined) =>
  new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const percentage = (value: Decimal.Value | null | undefined) =>
  new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function calculateOrderItem(input: OrderCalculationInput): OrderItemCalculation {
  const boxes = quantity(input.qtd_caixas);
  const unitsPerBox = quantity(input.qtd_unitaria);
  const unitPrice = money(input.preco_unitario);
  const discount = percentage(input.desconto_perc);
  const ipi = percentage(input.ipi_perc);

  const totalQuantity = quantity(boxes.mul(unitsPerBox));
  const discountedValue = money(unitPrice.mul(new Decimal(1).minus(discount.div(100))));
  const taxedValue = money(discountedValue.mul(new Decimal(1).plus(ipi.div(100))));
  const totalWithoutTax = money(totalQuantity.mul(discountedValue));
  const totalWithTax = money(totalQuantity.mul(taxedValue));

  return {
    qtd_caixas: boxes.toFixed(3),
    qtd_unitaria: unitsPerBox.toFixed(3),
    qtd_total: totalQuantity.toFixed(3),
    preco_unitario: unitPrice.toFixed(2),
    desconto_perc: discount.toFixed(2),
    valor_com_desconto: discountedValue.toFixed(2),
    ipi_perc: ipi.toFixed(2),
    valor_com_imposto: taxedValue.toFixed(2),
    total_item_sem_imposto: totalWithoutTax.toFixed(2),
    total_item_com_imposto: totalWithTax.toFixed(2),
  };
}

export function calculateOrderTotals(items: OrderItemCalculation[]) {
  const gross = items.reduce(
    (sum, item) => sum.plus(new Decimal(item.qtd_total).mul(item.preco_unitario)),
    new Decimal(0),
  );
  const withoutTax = items.reduce((sum, item) => sum.plus(item.total_item_sem_imposto), new Decimal(0));
  const withTax = items.reduce((sum, item) => sum.plus(item.total_item_com_imposto), new Decimal(0));

  return {
    valor_bruto: money(gross).toFixed(2),
    desconto_total: money(gross.minus(withoutTax)).toFixed(2),
    total_sem_imposto: money(withoutTax).toFixed(2),
    ipi_total: money(withTax.minus(withoutTax)).toFixed(2),
    total_com_imposto: money(withTax).toFixed(2),
  };
}
