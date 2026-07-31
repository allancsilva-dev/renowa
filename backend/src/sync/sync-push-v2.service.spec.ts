import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SyncEntity, SyncOperation, SyncPushV2Dto } from './dto/sync.dto';
import { OrdersSyncWriter } from './writers/orders-sync.writer';
import { SyncService } from './sync.service';

describe('SyncService push v2', () => {
  const item = {
    operation_id: 'ca9d0af4-6d32-445f-bca5-8a0700c4db24',
    uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
    entity: SyncEntity.FORNECEDORES,
    operation: SyncOperation.UPDATE,
    payload: { razao_social: 'Nova' },
    base_version: 3,
  };

  function subject(results: unknown[]) {
    const query = jest.fn().mockImplementation(() => Promise.resolve(results.shift()));
    const queryRunner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), query,
    };
    const service = new SyncService({ createQueryRunner: () => queryRunner } as never, new OrdersSyncWriter());
    const dto: SyncPushV2Dto = {
      device_id: '3df8a8c7-dd23-4e70-bcc7-468ccaf12c31',
      sync_run_id: '82e6e7bd-7571-4791-9623-6b99eec7cece',
      items: [item],
    };
    return { service, dto, query, queryRunner };
  }

  it('applies update only with matching server version', async () => {
    const { service, dto, query } = subject([[], [], [], [{ version: 3 }], [{ version: 4 }], []]);
    const response = await service.pushItemsV2(dto, 'tenant-a');
    expect(response.results[0]).toMatchObject({ status: 'applied', version: 4, retryable: false });
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
    expect(update?.[0]).toContain('AND version = $3');
    expect(update?.[0]).toContain('version = version + 1');
    expect(update?.[1]).toEqual([item.uuid, 'tenant-a', 3, 'Nova']);
  });

  it('returns structured conflict instead of silently overwriting', async () => {
    const { service, dto } = subject([[], [], [], [{ version: 4 }], [], [{ version: 4 }], []]);
    const response = await service.pushItemsV2(dto, 'tenant-a');
    expect(response.results[0]).toMatchObject({
      status: 'conflict', code: 'VERSION_CONFLICT', version: 4, retryable: false,
    });
  });

  it('returns cached terminal result for the same device operation', async () => {
    const cached = { ...item, status: 'applied', code: 'APPLIED', retryable: false, version: 4 };
    const { service, dto, query } = subject([[], [{ result: cached }]]);
    const response = await service.pushItemsV2(dto, 'tenant-a');
    expect(response.results[0]).toEqual(cached);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('classifies missing base version as terminal rejection', async () => {
    const { service, dto } = subject([[], [], [], [{ version: 3 }], [], []]);
    delete dto.items[0].base_version;
    const response = await service.pushItemsV2(dto, 'tenant-a');
    expect(response.results[0]).toMatchObject({
      status: 'rejected', code: 'VALIDATION_FAILED', retryable: false,
    });
  });

  it('classifies infrastructure failure as retryable and rolls back', async () => {
    const { service, dto, queryRunner } = subject([Promise.reject(new Error('db unavailable'))]);
    const response = await service.pushItemsV2(dto, 'tenant-a');
    expect(response.results[0]).toMatchObject({
      status: 'retryable', code: 'TEMPORARY_FAILURE', retryable: true,
    });
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});

describe('0009 sync push v2 contracts', () => {
  const sql = readFileSync(join(__dirname, '../database/migrations/0009_sync_push_v2.sql'), 'utf8');

  it('versions every synced entity', () => {
    for (const table of Object.values(SyncEntity)) expect(sql).toContain(`'${table}'`);
    expect(sql).toContain('version integer NOT NULL DEFAULT 1');
  });

  it('deduplicates an operation per tenant and device', () => {
    expect(sql).toContain('PRIMARY KEY (tenant_id, device_id, operation_id)');
  });
});
