import 'reflect-metadata';
import { SyncEntity, SyncOperation } from './dto/sync.dto';
import { SYNC_ENTITY_POLICIES } from './sync-entity-policy';
import { SyncService } from './sync.service';

describe('SyncService security', () => {
  const makeService = (query: jest.Mock) => {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query,
    };
    const service = new SyncService({ createQueryRunner: () => queryRunner } as never);
    return { service, queryRunner };
  };

  it('rejects payload fields outside the entity allowlist before SQL execution', async () => {
    const query = jest.fn();
    const { service, queryRunner } = makeService(query);

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

  it.each([
    ['raw foreign key', { cliente_id: 99 }],
    ['server-controlled order number', { numero_pedido: 1234 }],
    ['server-controlled tenant', { tenant_id: 'other-tenant' }],
    ['inherited object key', { toString: 'not-allowed' }],
  ])('rejects %s before SQL execution', async (_label, payload) => {
    const query = jest.fn();
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.UPDATE,
        payload,
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('Campos não permitidos');
    expect(query).not.toHaveBeenCalled();
  });

  it.each(Object.values(SyncEntity))(
    'rejects server-controlled fields for %s before SQL execution',
    async (entity) => {
      const query = jest.fn();
      const { service } = makeService(query);

      const response = await service.pushItems(
        [{
          uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
          entity,
          operation: SyncOperation.UPDATE,
          payload: { updated_at: '2099-01-01T00:00:00.000Z' },
        }],
        'tenant-1',
      );

      expect(response.results[0]).toMatchObject({ status: 'error' });
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each(
    Object.entries(SYNC_ENTITY_POLICIES).flatMap(([entity, policy]) =>
      Object.values(policy.foreignKeys).map((foreignKey) => [entity, foreignKey.column] as const),
    ),
  )('rejects raw FK column %s.%s before SQL execution', async (entity, column) => {
    const query = jest.fn();
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: entity as SyncEntity,
        operation: SyncOperation.UPDATE,
        payload: { [column]: 99 },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a foreign UUID not found in the current tenant', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 10, updated_at: '2026-01-01T00:00:00.000Z' }])
      .mockResolvedValueOnce([]);
    const { service, queryRunner } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.UPDATE,
        payload: { cliente_uuid: '9efec573-a190-4464-be12-49e13a63d193' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('FK não encontrada');
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('tenant_id = $2'),
      ['9efec573-a190-4464-be12-49e13a63d193', 'tenant-1'],
    ]);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('maps a valid FK UUID to its internal column using a tenant-scoped lookup', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 10, updated_at: '2026-01-01T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ id: 25 }])
      .mockResolvedValueOnce([]);
    const { service, queryRunner } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.UPDATE,
        payload: { cliente_uuid: '9efec573-a190-4464-be12-49e13a63d193' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'ok', id: 10 });
    expect(query.mock.calls[2]).toEqual([
      expect.stringContaining('SET "cliente_id" = $3'),
      ['7f9a9e95-78fb-41f8-83c9-108ddab00962', 'tenant-1', 25],
    ]);
    expect(query.mock.calls[2][0]).not.toContain('cliente_uuid');
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('maps explicit null only for optional foreign keys', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 10, updated_at: '2026-01-01T00:00:00.000Z' }])
      .mockResolvedValueOnce([]);
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.UPDATE,
        payload: { cliente_uuid: null },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'ok' });
    expect(query.mock.calls[1]).toEqual([
      expect.stringContaining('SET "cliente_id" = $3'),
      ['7f9a9e95-78fb-41f8-83c9-108ddab00962', 'tenant-1', null],
    ]);
  });

  it('requires pedido_uuid when creating an order item', async () => {
    const query = jest.fn();
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.ITENS_PEDIDO,
        operation: SyncOperation.CREATE,
        payload: { descricao_manual: 'Item avulso' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('FKs obrigatórias ausentes');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects null for the required order-item FK', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 10, updated_at: '2026-01-01T00:00:00.000Z' }]);
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.ITENS_PEDIDO,
        operation: SyncOperation.UPDATE,
        payload: { pedido_uuid: null },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('FK obrigatória não aceita null');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed FK UUIDs without querying the target table', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 10, updated_at: '2026-01-01T00:00:00.000Z' }]);
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.UPDATE,
        payload: { cliente_uuid: 'not-a-uuid' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('FK inválida');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('sync entity policy', () => {
  it('covers every sync entity with safe, non-overlapping identifiers', () => {
    expect(Object.keys(SYNC_ENTITY_POLICIES).sort()).toEqual(Object.values(SyncEntity).sort());

    for (const policy of Object.values(SYNC_ENTITY_POLICIES)) {
      const foreignKeys = Object.entries(policy.foreignKeys);
      const identifiers = [
        policy.table,
        ...policy.writableFields,
        ...policy.serverControlledFields,
        ...foreignKeys.flatMap(([input, foreignKey]) => [
          input,
          foreignKey.column,
          foreignKey.targetTable,
        ]),
      ];

      expect(identifiers.every((identifier) => /^[a-z_]+$/.test(identifier))).toBe(true);
      expect(policy.writableFields.some((field) => field.endsWith('_id'))).toBe(false);
      expect(policy.writableFields.filter((field) =>
        policy.serverControlledFields.includes(field as never),
      )).toEqual([]);
      expect(foreignKeys.every(([input, foreignKey]) =>
        input.endsWith('_uuid') && foreignKey.column.endsWith('_id'),
      )).toBe(true);
    }
  });
});
