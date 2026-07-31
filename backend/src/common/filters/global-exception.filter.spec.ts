import { ArgumentsHost } from '@nestjs/common';
import { ConcurrentModificationException } from '../errors/concurrent-modification.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  function createHost(url = '/internal') {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url }),
      }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  }

  it('sanitizes unexpected Error responses', () => {
    const { host, status, json } = createHost();

    new GlobalExceptionFilter().catch(
      new Error('password=secret database connection failed'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno do servidor.',
      }),
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('password=secret');
  });

  it('sanitizes unexpected non-Error responses', () => {
    const { host, status, json } = createHost();

    new GlobalExceptionFilter().catch('database details', host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Erro interno do servidor.',
      }),
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain('database details');
  });

  // Sem este ramo, um uuid repetido (duplo clique, retry de rede) que escapa da
  // guarda de aplicação vira 500 — erro de banco vazando como falha do servidor.
  it.each([
    ['embrulhado pelo TypeORM', Object.assign(new Error('duplicate key value'), {
      driverError: { code: '23505', detail: 'Key (uuid)=(abc) already exists.' },
    })],
    ['cru do driver', Object.assign(new Error('duplicate key value'), { code: '23505' })],
  ])('mapeia unique_violation %s para 409', (_caso, exception) => {
    const { host, status, json } = createHost('/pedidos');

    new GlobalExceptionFilter().catch(exception, host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'CONFLICT',
        message: 'Registro duplicado: já existe um cadastro com estes dados.',
      }),
    });
    // Nome de constraint e valores ficam no log, não na resposta.
    expect(JSON.stringify(json.mock.calls)).not.toContain('Key (uuid)');
  });

  it('não confunde outro erro de banco com duplicidade', () => {
    const { host, status } = createHost('/pedidos');

    new GlobalExceptionFilter().catch(
      Object.assign(new Error('violates foreign key constraint'), { driverError: { code: '23503' } }),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
  });

  it('preserves optimistic concurrency metadata', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/pedidos/order-id/status' }),
      }),
    } as unknown as ArgumentsHost;

    new GlobalExceptionFilter().catch(
      new ConcurrentModificationException('order', 'order-id', 2, 3),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'CONCURRENT_MODIFICATION',
        resource: 'order',
        resourceId: 'order-id',
        expectedVersion: 2,
        currentVersion: 3,
      }),
    });
  });
});
