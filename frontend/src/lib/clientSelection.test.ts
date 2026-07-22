import { describe, expect, it } from 'vitest';
import { applyClientToOrderHeader } from './clientSelection';

describe('applyClientToOrderHeader', () => {
  const current = { pgt: 'Boleto atual', prazo: 'Prazo digitado pelo vendedor', local_entrega: 'Entrega atual', transportadora_uuid: 'transp-atual' };

  it('não herda o prazo do cliente — mantém o que já estava no formulário', () => {
    const result = applyClientToOrderHeader(current, {
      pgt_padrao: 'Pix', local_entrega: 'Depósito Central', transportadora: { uuid: 'transp-cliente' },
    });
    expect(result.prazo).toBe('Prazo digitado pelo vendedor');
  });

  it('copia pagamento, local de entrega e transportadora do cliente quando presentes', () => {
    const result = applyClientToOrderHeader(current, {
      pgt_padrao: 'Pix', local_entrega: 'Depósito Central', transportadora: { uuid: 'transp-cliente' },
    });
    expect(result.pgt).toBe('Pix');
    expect(result.local_entrega).toBe('Depósito Central');
    expect(result.transportadora_uuid).toBe('transp-cliente');
  });

  it('mantém os valores atuais quando o cliente não tem os campos preenchidos', () => {
    const result = applyClientToOrderHeader(current, { pgt_padrao: null, local_entrega: null, transportadora: null });
    expect(result.pgt).toBe('Boleto atual');
    expect(result.local_entrega).toBe('Entrega atual');
    expect(result.transportadora_uuid).toBe('transp-atual');
  });

  it('mantém os valores atuais quando nenhum cliente é passado', () => {
    const result = applyClientToOrderHeader(current, undefined);
    expect(result).toEqual(current);
  });
});
