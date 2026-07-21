import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface ItemInput {
  qtd_caixas: string | number;
  qtd_unitaria: string | number;
  preco_unitario: string | number | null;
  desconto_perc: string | number;
  ipi_perc: string | number;
}

const value = (input: string | number | null | undefined) => new Decimal(input === '' || input == null ? 0 : input);
const q = (input: Decimal.Value) => new Decimal(input).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
const m = (input: Decimal.Value) => new Decimal(input).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function previewItem(input: ItemInput) {
  const totalQuantity = q(value(input.qtd_caixas).mul(value(input.qtd_unitaria)));
  const discountedUnit = m(value(input.preco_unitario).mul(new Decimal(1).minus(value(input.desconto_perc).div(100))));
  const taxedUnit = m(discountedUnit.mul(new Decimal(1).plus(value(input.ipi_perc).div(100))));
  return {
    qtd_total: totalQuantity.toFixed(3),
    valor_com_desconto: discountedUnit.toFixed(2),
    valor_com_imposto: taxedUnit.toFixed(2),
    total_sem_imposto: m(totalQuantity.mul(discountedUnit)).toFixed(2),
    total_com_imposto: m(totalQuantity.mul(taxedUnit)).toFixed(2),
  };
}

export function previewOrder(items: ItemInput[]) {
  return items.reduce(
    (totals, item) => {
      const calculated = previewItem(item);
      return {
        semImposto: m(value(totals.semImposto).plus(calculated.total_sem_imposto)).toFixed(2),
        comImposto: m(value(totals.comImposto).plus(calculated.total_com_imposto)).toFixed(2),
      };
    },
    { semImposto: '0.00', comImposto: '0.00' },
  );
}
