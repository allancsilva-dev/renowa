import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';

describe('AppController health', () => {
  it('reports ready only after a real database probe', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as any;
    const controller = new AppController(dataSource);

    await expect(controller.readiness()).resolves.toEqual({ status: 'ready' });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('reports unavailable when the database probe fails', async () => {
    const dataSource = { query: jest.fn().mockRejectedValue(new Error('db down')) } as any;
    const controller = new AppController(dataSource);

    await expect(controller.readiness()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
