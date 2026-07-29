import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Cálculo do chamado de SAC — fonte de verdade, espelhando a política de
 * `order-calculation.ts`: quantidade com 3 casas, dinheiro com 2, sempre
 * ROUND_HALF_UP. O preview do frontend é conveniência; o valor persistido
 * sai daqui.
 */
export interface SacItemCalculationInput {
  quantidade?: number | string | null;
  valor_unitario?: number | string | null;
}

export interface SacItemCalculation {
  quantidade: string;
  valor_unitario: string;
  valor_total: string;
}

/**
 * `?? 0` não cobre string vazia, e `new Decimal('')` LANÇA `[DecimalError]
 * Invalid argument`. Não há caminho HTTP hoje — o DTO exige `@IsNumber` — mas
 * um chamador interno (import de CSV, migração) derrubaria o servidor com 500
 * em vez de 400. O frontend já coalescia; o backend passou a coalescer também
 * em BACKLOG-0057, e a fixture compartilhada cobre o caso nos dois lados.
 */
const numero = (value: Decimal.Value | null | undefined): Decimal.Value =>
  value === '' || value === null || value === undefined ? 0 : value;

const quantity = (value: Decimal.Value | null | undefined) =>
  new Decimal(numero(value)).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
const money = (value: Decimal.Value | null | undefined) =>
  new Decimal(numero(value)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function calculateSacItem(input: SacItemCalculationInput): SacItemCalculation {
  const quantidade = quantity(input.quantidade);
  const valorUnitario = money(input.valor_unitario);

  return {
    quantidade: quantidade.toFixed(3),
    valor_unitario: valorUnitario.toFixed(2),
    valor_total: money(quantidade.mul(valorUnitario)).toFixed(2),
  };
}

/**
 * Total do chamado = soma dos `valor_total` JÁ ARREDONDADOS de cada item.
 * Somar antes de arredondar daria um total que não bate com a coluna
 * VL. TOTAL NF impressa no papel.
 */
export function calculateSacTotal(items: SacItemCalculation[]): string {
  const total = items.reduce((sum, item) => sum.plus(item.valor_total), new Decimal(0));
  return money(total).toFixed(2);
}
