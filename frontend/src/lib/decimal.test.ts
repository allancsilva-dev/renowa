import { describe, expect, it } from 'vitest';
import { moneyForDisplay, normalizeMoney } from './decimal';

describe('normalizeMoney', () => {
  it.each([
    ['1.005', 1.01],
    ['1.004', 1],
    ['1.015', 1.02],
    [2.675, 2.68],
    [null, 0],
  ])('normaliza %s com ROUND_HALF_UP', (value, expected) => {
    expect(normalizeMoney(value)).toBe(expected);
    expect(moneyForDisplay(value)).toBe(expected);
  });
});
