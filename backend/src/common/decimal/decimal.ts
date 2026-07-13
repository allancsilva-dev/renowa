import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type DecimalValue = string;

export function decimal(value: Decimal.Value | null | undefined): Decimal {
  return new Decimal(value ?? 0);
}

export function money(value: Decimal.Value | null | undefined): DecimalValue {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function percentageOf(base: Decimal.Value, percentage: Decimal.Value): DecimalValue {
  return money(decimal(base).mul(percentage).div(100));
}

export function sumMoney(values: Array<Decimal.Value | null | undefined>): DecimalValue {
  return money(values.reduce<Decimal>((total, value) => total.plus(value ?? 0), decimal(0)));
}
