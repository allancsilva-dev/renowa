import { describe, expect, it } from 'vitest';
import { hojeLocal, isDataCompleta } from './date';

describe('isDataCompleta', () => {
  it.each(['2026-07-20', '2000-01-01', '2100-12-31', '2028-02-29'])('aceita %s', (value) => {
    expect(isDataCompleta(value)).toBe(true);
  });

  it.each([
    ['vazio', ''],
    ['nulo', null],
    ['ano digitado pela metade', '0002-07-20'],
    ['ano digitado pela metade (3 dígitos)', '0202-07-20'],
    ['ano absurdo', '2999-07-20'],
    ['dia inexistente', '2026-02-30'],
    ['fora do formato', '20/07/2026'],
  ])('recusa %s', (_nome, value) => {
    expect(isDataCompleta(value)).toBe(false);
  });
});

describe('hojeLocal', () => {
  it('usa a data local, com zero à esquerda', () => {
    expect(hojeLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
