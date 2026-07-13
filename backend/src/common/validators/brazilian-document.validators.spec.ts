import { isValidCep, isValidCnpj } from './brazilian-document.validators';

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
});
