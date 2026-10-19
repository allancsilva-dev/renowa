import { saoPauloDate } from './sao-paulo-date';

describe('saoPauloDate', () => {
  it('usa o dia civil de São Paulo, não o de UTC', () => {
    // 23h30 em São Paulo (UTC-3) já é o dia seguinte em UTC.
    expect(saoPauloDate(new Date('2026-07-21T02:30:00Z'))).toBe('2026-07-20');
  });

  it('formata como YYYY-MM-DD', () => {
    expect(saoPauloDate(new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05');
  });
});
