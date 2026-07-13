import { money, percentageOf, sumMoney } from './decimal';

describe('decimal contract', () => {
  it('uses decimal arithmetic and ROUND_HALF_UP for money', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(money('1.005')).toBe('1.01');
    expect(percentageOf('199.90', '7.50')).toBe('14.99');
  });

  it('preserves large values without IEEE-754 loss', () => {
    expect(sumMoney(['9999999999.99', '0.01'])).toBe('10000000000.00');
  });
});
