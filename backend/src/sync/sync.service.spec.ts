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

  // Campo controlado pelo servidor e campo desconhecido são barrados pelo mesmo
  // portão, antes de qualquer SQL, mas com mensagens diferentes: `numero_pedido`
  // existe e é do servidor, `toString` não existe. Antes de PROB-0074 os dois
  // caíam na mesma frase genérica e o cliente não tinha como distinguir.
  it.each([
    ['raw foreign key', { cliente_id: 99 }, 'Campos não permitidos'],
    ['server-controlled order number', { numero_pedido: 1234 }, 'Campos controlados pelo servidor'],
    ['server-controlled tenant', { tenant_id: 'other-tenant' }, 'Campos controlados pelo servidor'],
    ['inherited object key', { toString: 'not-allowed' }, 'Campos não permitidos'],
  ])('rejects %s before SQL execution', async (_label, payload, mensagem) => {
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
    expect(response.results[0].message).toContain(mensagem);
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
    expect(query.mock.calls[2][0]).not.toContain('updated_at');
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

/**
 * PROB-0074: o push escrevia em `pedidos` por SQL cru com uma allowlist que não
 * consultava `origem`. Pedido de origem externa não tem itens — os totais são o
 * valor declarado, e a igualdade entre eles virou CHECK na `0037` — e a
 * transição de status tem endpoint próprio com permissão própria. O sync
 * furava os dois em silêncio.
 *
 * Cobre v1 e v2: são dois caminhos distintos, e só o v2 tem guarda de `version`.
 */
describe('SyncService — gate de origem do pedido', () => {
  const UUID = '7f9a9e95-78fb-41f8-83c9-108ddab00962';

  function makeService(resultados: unknown[]) {
    const query = jest.fn().mockImplementation(() => Promise.resolve(resultados.shift() ?? []));
    const queryRunner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), query,
    };
    const service = new SyncService({ createQueryRunner: () => queryRunner } as never);
    return { service, query };
  }

  const pedido = (over: Record<string, unknown> = {}) => ({
    id: 1,
    updated_at: '2020-01-01T00:00:00.000Z',
    numero_pedido: 42,
    origem: 'externo',
    status: 'em_aberto',
    version: 3,
    ...over,
  });

  const pushV1 = (service: SyncService, payload: Record<string, unknown>) =>
    service.pushItems(
      [{ uuid: UUID, entity: SyncEntity.PEDIDOS, operation: SyncOperation.UPDATE, payload }],
      'tenant-1',
    );

  const pushV2 = (service: SyncService, payload: Record<string, unknown>) =>
    service.pushItemsV2(
      {
        device_id: '3df8a8c7-dd23-4e70-bcc7-468ccaf12c31',
        sync_run_id: '82e6e7bd-7571-4791-9623-6b99eec7cece',
        items: [{
          operation_id: 'ca9d0af4-6d32-445f-bca5-8a0700c4db24',
          uuid: UUID,
          entity: SyncEntity.PEDIDOS,
          operation: SyncOperation.UPDATE,
          payload,
          base_version: 3,
        }],
      },
      'tenant-1',
    );

  // A projeção do v1 é enxuta por padrão; sem `origem`/`status` nela o gate não
  // teria como decidir e voltaria a passar batido.
  it('v1 lê origem e status na projeção de pedidos', async () => {
    const { service, query } = makeService([[pedido()], []]);
    await pushV1(service, { observacao: 'ok' });

    const select = query.mock.calls.find(([sql]) => String(sql).startsWith('SELECT'));
    expect(select?.[0]).toContain('origem');
    expect(select?.[0]).toContain('status');
  });

  it.each([
    ['status', { status: 'liberado' }],
    ['total_sem_imposto', { total_sem_imposto: 10 }],
    ['total_com_imposto', { total_com_imposto: 10 }],
  ])('v1 rejeita %s em pedido de origem externa', async (campo, payload) => {
    const { service, query } = makeService([[pedido()]]);
    const response = await pushV1(service, payload);

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain("origem 'externo'");
    expect(response.results[0].message).toContain(campo);
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  // PROB-0065 segue aberto de propósito: o sync ainda escreve `status` em pedido
  // interno. Este caso existe para que fechá-lo seja uma decisão, não um efeito
  // colateral do gate de origem.
  it('v1 mantém status gravável em pedido interno', async () => {
    const { service, query } = makeService([[pedido({ origem: 'interno' })], []]);
    const response = await pushV1(service, { status: 'liberado' });

    expect(response.results[0]).toMatchObject({ status: 'ok' });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(true);
  });

  it('v1 recusa editar pedido externo fora de em_aberto', async () => {
    const { service, query } = makeService([[pedido({ status: 'faturado' })]]);
    const response = await pushV1(service, { observacao: 'tarde demais' });

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('em_aberto');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  // CREATE não tem linha para consultar: a allowlist base continua valendo, e o
  // caminho de criação não pode ter sido quebrado pela segunda passada.
  it('v1 segue criando pedido quando não existe linha', async () => {
    const { service, query } = makeService([[], [{ numero: 7 }], [{ id: 10 }]]);
    const response = await service.pushItems(
      [{
        uuid: UUID,
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.CREATE,
        payload: { status: 'em_aberto', total_com_imposto: 100 },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'ok', numero_pedido: 7 });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT'))).toBe(true);
  });

  it.each([
    ['status', { status: 'liberado' }],
    ['total_com_imposto', { total_com_imposto: 10 }],
  ])('v2 rejeita %s em pedido de origem externa como não-retryable', async (campo, payload) => {
    const { service } = makeService([[], [], [], [pedido()], [], []]);
    const response = await pushV2(service, payload);

    expect(response.results[0]).toMatchObject({
      status: 'rejected', code: 'VALIDATION_FAILED', retryable: false,
    });
    expect(response.results[0].message).toContain(campo);
  });

  it('v2 recusa editar pedido externo fora de em_aberto', async () => {
    const { service } = makeService([[], [], [], [pedido({ status: 'liberado' })], [], []]);
    const response = await pushV2(service, { observacao: 'tarde demais' });

    expect(response.results[0]).toMatchObject({
      status: 'rejected', code: 'VALIDATION_FAILED', retryable: false,
    });
    expect(response.results[0].message).toContain('em_aberto');
  });

  it('v2 mantém status gravável em pedido interno', async () => {
    const { service } = makeService([
      [], [], [], [pedido({ origem: 'interno' })], [{ version: 4 }], [],
    ]);
    const response = await pushV2(service, { status: 'liberado' });

    expect(response.results[0]).toMatchObject({ status: 'applied', version: 4 });
  });
});
