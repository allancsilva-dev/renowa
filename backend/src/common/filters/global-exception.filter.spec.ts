import { ArgumentsHost } from '@nestjs/common';
import { ConcurrentModificationException } from '../errors/concurrent-modification.exception';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
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
