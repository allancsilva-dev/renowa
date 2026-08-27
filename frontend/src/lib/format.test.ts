import { describe, expect, it } from 'vitest';
import { formatEnderecoCompleto, maskCep, maskCnpj, maskTel } from './format';

describe('formatEnderecoCompleto', () => {
  it('junta todas as partes na ordem esperada', () => {
    expect(formatEnderecoCompleto({
      endereco: 'Rua X', numero: '100', complemento: 'Sala 2',
      bairro: 'Centro', cidade: 'São Paulo', uf: 'SP', cep: '01000-000',
    })).toBe('Rua X, 100 - Sala 2 - Centro, São Paulo/SP - 01000-000');
  });

  it('omite partes ausentes sem deixar separador órfão', () => {
    expect(formatEnderecoCompleto({ endereco: 'Rua X', cidade: 'Recife', uf: 'PE' }))
      .toBe('Rua X - Recife/PE');
    expect(formatEnderecoCompleto({ cep: '01000-000' })).toBe('01000-000');
  });

  it('devolve string vazia quando não há nada aproveitável', () => {
    expect(formatEnderecoCompleto({})).toBe('');
    expect(formatEnderecoCompleto({ endereco: '   ', uf: null })).toBe('');
  });
});

describe('máscaras', () => {
  it('formata CNPJ parcial enquanto digita', () => {
    expect(maskCnpj('12')).toBe('12');
    expect(maskCnpj('123456')).toBe('12.345.6');
    expect(maskCnpj('12345678000190')).toBe('12.345.678/0001-90');
    expect(maskCnpj('12345678000190999')).toBe('12.345.678/0001-90');
  });

  it('formata telefone fixo e celular', () => {
    expect(maskTel('1133334444')).toBe('(11) 3333-4444');
    expect(maskTel('11999998888')).toBe('(11) 99999-8888');
  });

  it('formata CEP', () => {
    expect(maskCep('01000000')).toBe('01000-000');
    expect(maskCep('010')).toBe('010');
  });
});
