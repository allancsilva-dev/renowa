import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalValue = string;

export function moneyString(value: Decimal.Value | null | undefined): DecimalValue {
  return new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function percentageOf(base: Decimal.Value, percentage: Decimal.Value): DecimalValue {
  return moneyString(new Decimal(base).mul(percentage).div(100));
}

export function sumMoney(values: Array<Decimal.Value | null | undefined>): DecimalValue {
  return moneyString(values.reduce<Decimal>((sum, value) => sum.plus(value ?? 0), new Decimal(0)));
}

export function moneyForDisplay(value: Decimal.Value | null | undefined): number {
  return new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

const QTY_FORMATTER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** Formata quantidade (armazenada com 3 casas fixas, ex. "12.000") para exibição pt-BR.
 * Sem isso, o ponto decimal é lido como separador de milhar ("12.000" -> "12 mil"). */
export function qtyForDisplay(value: Decimal.Value | null | undefined): string {
  return QTY_FORMATTER.format(new Decimal(value ?? 0).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toNumber());
}
