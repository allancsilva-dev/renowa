import { isValidCep, isValidCnpj, isValidCpf, isValidCpfOrCnpj } from './brazilian-document.validators';

describe('Brazilian document validators', () => {
  it.each(['11.222.333/0001-81', '11222333000181'])('accepts valid CNPJ %s', (value) => {
    expect(isValidCnpj(value)).toBe(true);
  });

  it.each(['11.222.333/0001-82', '00000000000000', '123'])('rejects invalid CNPJ %s', (value) => {
    expect(isValidCnpj(value)).toBe(false);
  });

  it.each(['01310-100', '01310100'])('accepts valid CEP %s', (value) => {
    expect(isValidCep(value)).toBe(true);
  });

  it.each(['0131-100', '0131010A'])('rejects invalid CEP %s', (value) => {
    expect(isValidCep(value)).toBe(false);
  });

  it.each(['529.982.247-25', '52998224725', '11144477735'])('accepts valid CPF %s', (value) => {
    expect(isValidCpf(value)).toBe(true);
  });

  it.each(['529.982.247-24', '11111111111', '1234567890', 12345678909])('rejects invalid CPF %s', (value) => {
    expect(isValidCpf(value)).toBe(false);
  });

  it('accepts CPF or CNPJ and nothing else', () => {
    expect(isValidCpfOrCnpj('52998224725')).toBe(true);
    expect(isValidCpfOrCnpj('11222333000181')).toBe(true);
    expect(isValidCpfOrCnpj('5299822472')).toBe(false);
  });
});
