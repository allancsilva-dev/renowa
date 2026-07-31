import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export interface ItemInput {
  qtd_caixas?: string | number | null;
  qtd_unitaria?: string | number | null;
  preco_unitario?: string | number | null;
  desconto_perc?: string | number | null;
  ipi_perc?: string | number | null;
}

const value = (input: string | number | null | undefined) => new Decimal(input === '' || input == null ? 0 : input);
const q = (input: Decimal.Value) => new Decimal(input).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
const m = (input: Decimal.Value) => new Decimal(input).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function previewItem(input: ItemInput) {
  // Normalização de entrada idêntica à do backend: quantidades a 3 casas,
  // preço e percentuais a 2, ANTES de qualquer conta.
  const boxes = q(value(input.qtd_caixas));
  const unitsPerBox = q(value(input.qtd_unitaria));
  const unitPrice = m(value(input.preco_unitario));
  const discount = m(value(input.desconto_perc));
  const ipi = m(value(input.ipi_perc));

  const totalQuantity = q(boxes.mul(unitsPerBox));
  // BACKLOG-0065: espelha `backend/src/orders/order-calculation.ts` — unitário em
  // precisão cheia na aritmética, arredondamento só no total da linha. Os
  // unitários abaixo são campos de leitura.
  const discountedUnit = unitPrice.mul(new Decimal(1).minus(discount.div(100)));
  const taxedUnit = discountedUnit.mul(new Decimal(1).plus(ipi.div(100)));
  return {
    qtd_total: totalQuantity.toFixed(3),
    valor_com_desconto: m(discountedUnit).toFixed(2),
    valor_com_imposto: m(taxedUnit).toFixed(2),
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
