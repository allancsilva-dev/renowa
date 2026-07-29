import { describe, expect, it } from 'vitest';
import { getApiErrorMessage } from './errors';

function apiError(status: number, message?: string) {
  return { response: { status, data: message ? { error: { message } } : undefined } };
}

describe('getApiErrorMessage', () => {
  it('mostra a mensagem real do backend em 400 (ex.: nome de perfil duplicado)', () => {
    expect(getApiErrorMessage(apiError(400, 'Já existe uma role com este nome no tenant')))
      .toBe('Já existe uma role com este nome no tenant');
  });

  it('mostra a mensagem real do backend em 403 (ex.: proteção de role de sistema)', () => {
    expect(getApiErrorMessage(apiError(403, 'Role de sistema não pode ser renomeada')))
      .toBe('Role de sistema não pode ser renomeada');
  });

  it('cai pro texto genérico quando 400/403 vem sem mensagem do backend', () => {
    expect(getApiErrorMessage(apiError(400))).toBe('Usuário não tem acesso ao Renowa');
    expect(getApiErrorMessage(apiError(403))).toBe('Usuário não tem acesso ao Renowa');
  });

  it('mantém os textos fixos de 422/404 (login e outros fluxos não tocados)', () => {
    expect(getApiErrorMessage(apiError(422))).toBe('Email não cadastrado no ZonaDev Auth');
    expect(getApiErrorMessage(apiError(404))).toBe('Recurso não encontrado');
  });

  // BACKLOG-0056: o texto fixo escondia a razão do conflito. Estes dois casos
  // eram um só antes, fixando o comportamento antigo.
  it('mostra a mensagem real do backend em 409 (ex.: pedido já liberado)', () => {
    expect(getApiErrorMessage(apiError(409, 'Pedido já liberado não pode ser editado')))
      .toBe('Pedido já liberado não pode ser editado');
    expect(getApiErrorMessage(apiError(409, 'Limite de 10 fotos por pedido atingido')))
      .toBe('Limite de 10 fotos por pedido atingido');
  });

  it('cai pro texto genérico quando 409 vem sem mensagem do backend', () => {
    expect(getApiErrorMessage(apiError(409))).toBe('Recurso em uso — não pode ser removido');
  });

  it('cai pro texto genérico em erro desconhecido', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('Erro inesperado. Tente novamente.');
  });
});
