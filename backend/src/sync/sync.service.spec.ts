import 'reflect-metadata';
import { SyncEntity, SyncOperation } from './dto/sync.dto';
import { SyncService } from './sync.service';

describe('SyncService security', () => {
  it('rejects payload fields outside the entity allowlist before SQL execution', async () => {
    const query = jest.fn();
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query,
    };
    const dataSource = {
      createQueryRunner: () => queryRunner,
    };
    const service = new SyncService(dataSource as never);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.CLIENTES,
        operation: SyncOperation.UPDATE,
        payload: { 'razao_social" = NULL; DROP TABLE clientes; --': 'ataque' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('Campos não permitidos');
    expect(query).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
