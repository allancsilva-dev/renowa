import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * Preview do cálculo do chamado de SAC — espelha `backend/src/sac/
 * sac-calculation.ts`, inclusive a ordem das operações (o valor unitário é
 * arredondado ANTES de multiplicar). É só conveniência de tela: o valor
 * persistido vem sempre do servidor.
 */
export interface SacItemInput {
  quantidade: string | number;
  valor_unitario: string | number | null;
}

const value = (input: string | number | null | undefined) => new Decimal(input === '' || input == null ? 0 : input);
const q = (input: Decimal.Value) => new Decimal(input).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
const m = (input: Decimal.Value) => new Decimal(input).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function previewSacItem(input: SacItemInput) {
  const quantidade = q(value(input.quantidade));
  const valorUnitario = m(value(input.valor_unitario));
  return {
    quantidade: quantidade.toFixed(3),
    valor_unitario: valorUnitario.toFixed(2),
    valor_total: m(quantidade.mul(valorUnitario)).toFixed(2),
  };
}

/** Soma dos totais JÁ arredondados — bate com a coluna impressa no papel. */
export function previewSacTotal(items: SacItemInput[]): string {
  return items
    .reduce((total, item) => total.plus(previewSacItem(item).valor_total), new Decimal(0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
}
