import { describe, expect, it } from 'vitest';
import { PAYMENT_METHODS, paymentOptionsWith } from '@/lib/paymentOptions';

describe('paymentOptionsWith', () => {
  it('devolve só as canônicas quando não há valor', () => {
    expect(paymentOptionsWith(undefined)).toEqual([...PAYMENT_METHODS]);
    expect(paymentOptionsWith(null)).toEqual([...PAYMENT_METHODS]);
    expect(paymentOptionsWith('   ')).toEqual([...PAYMENT_METHODS]);
  });

  it('não duplica um valor que já é canônico', () => {
    expect(paymentOptionsWith('BOL/PIX')).toEqual([...PAYMENT_METHODS]);
    expect(paymentOptionsWith('BOL/PIX').filter((o) => o === 'BOL/PIX')).toHaveLength(1);
  });

  it('anexa o valor legado uma vez só, no fim', () => {
    const options = paymentOptionsWith('Boleto 30/60');

    expect(options).toEqual([...PAYMENT_METHODS, 'Boleto 30/60']);
    expect(options.filter((o) => o === 'Boleto 30/60')).toHaveLength(1);
  });

  it('não normaliza caixa: "Pix" é legado, não vira PIX', () => {
    expect(paymentOptionsWith('Pix')).toContain('Pix');
    expect(paymentOptionsWith('Pix')).toHaveLength(PAYMENT_METHODS.length + 1);
  });
});
