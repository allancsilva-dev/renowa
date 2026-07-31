import 'reflect-metadata';
import { SyncEntity, SyncOperation } from './dto/sync.dto';
import { SYNC_ENTITY_POLICIES } from './sync-entity-policy';
import { OrdersSyncWriter } from './writers/orders-sync.writer';
import { SyncService } from './sync.service';

/**
 * Pedido interno em `em_aberto` — a forma que o `OrdersSyncWriter` exige para
 * deixar o push escrever. `loadOrderForWrite` lê pelo repositório, não por
 * `query`, então os índices de `query.mock.calls` seguem os mesmos.
 */
const PEDIDO_ABERTO = {
  id: 10, uuid: 'p-1', tenant_id: 'tenant-1', status: 'em_aberto', origem: 'interno',
  deleted_at: null, fornecedor_id: 5, total_sem_imposto: '0.00', total_com_imposto: '0.00',
};

describe('SyncService security', () => {
  const makeService = (query: jest.Mock, order: Record<string, unknown> | null = PEDIDO_ABERTO) => {
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(order),
      findOneOrFail: jest.fn().mockResolvedValue(order ?? {}),
      save: jest.fn(async (row: unknown) => row),
    };
    const itemRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: (row: unknown) => row,
      save: jest.fn(async (row: Record<string, unknown>) => ({ ...row, id: 77 })),
    };
    const manager = {
      getRepository: (entity: { name: string }) => (entity.name === 'Order' ? orderRepo : itemRepo),
      query,
    };
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
      query,
    };
    const service = new SyncService({ createQueryRunner: () => queryRunner } as never, new OrdersSyncWriter());
    return { service, queryRunner, orderRepo, itemRepo };
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

  /**
   * Reparent pela porta do sync mudaria os totais de DOIS pedidos, e o de origem
   * nem seria lido. Antes o `pedido_uuid` em UPDATE era aceito e só `null` era
   * barrado (por ser FK obrigatória); agora o pai vem sempre da linha gravada.
   */
  it.each([
    ['null', null],
    ['outro pedido', 'd0f2b1a4-1c3e-4a5b-9c2d-77e0f1a2b3c4'],
  ])('recusa trocar o pedido de um item no UPDATE (%s)', async (_label, pedidoUuid) => {
    const query = jest.fn();
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.ITENS_PEDIDO,
        operation: SyncOperation.UPDATE,
        payload: { pedido_uuid: pedidoUuid },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('pedido_uuid não pode ser alterado');
  });

  /** Item derivado é recusado com instrução, não com "campo desconhecido". */
  it('recusa total_item no push de item e ensina o que enviar', async () => {
    const query = jest.fn();
    const { service } = makeService(query);

    const response = await service.pushItems(
      [{
        uuid: '7f9a9e95-78fb-41f8-83c9-108ddab00962',
        entity: SyncEntity.ITENS_PEDIDO,
        operation: SyncOperation.UPDATE,
        payload: { total_item: '999.99' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('derivados');
    expect(response.results[0].message).toContain('total_item');
    expect(response.results[0].message).toContain('preco_unitario');
    expect(query).not.toHaveBeenCalled();
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
 * PROB-0065 / PROB-0074: o push escrevia em `pedidos` por SQL cru, a partir de
 * uma allowlist que aceitava `status` e os totais como ENTRADA.
 *
 * PROB-0074 fechou isso só para pedido de origem EXTERNA, com uma segunda
 * passada de allowlist que dependia de ler a linha. Aqui a regra passou a valer
 * para TODA origem: `status` é `serverControlled`, os totais são `derived`, e a
 * recusa acontece antes de qualquer SELECT. Os dois casos que fixavam
 * "`status` continua gravável em pedido interno" existiam justamente para que
 * fechar PROB-0065 fosse uma decisão explícita — estão invertidos abaixo.
 *
 * Cobre v1 e v2: são dois caminhos distintos, e só o v2 tem guarda de `version`.
 */
describe('SyncService — pedido tem uma porta de escrita só', () => {
  const UUID = '7f9a9e95-78fb-41f8-83c9-108ddab00962';

  function makeService(resultados: unknown[], order: Record<string, unknown> | null = null) {
    const query = jest.fn().mockImplementation(() => Promise.resolve(resultados.shift() ?? []));
    const orderRepo = {
      findOne: jest.fn().mockResolvedValue(order),
      findOneOrFail: jest.fn().mockResolvedValue(order ?? {}),
      save: jest.fn(async (row: unknown) => row),
    };
    const itemRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: (row: unknown) => row,
      save: jest.fn(async (row: Record<string, unknown>) => ({ ...row, id: 77 })),
    };
    const manager = {
      getRepository: (entity: { name: string }) => (entity.name === 'Order' ? orderRepo : itemRepo),
      query,
    };
    const queryRunner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), manager, query,
    };
    const service = new SyncService({ createQueryRunner: () => queryRunner } as never, new OrdersSyncWriter());
    return { service, query };
  }

  const pedido = (over: Record<string, unknown> = {}) => ({
    id: 1,
    uuid: UUID,
    tenant_id: 'tenant-1',
    updated_at: '2020-01-01T00:00:00.000Z',
    numero_pedido: 42,
    origem: 'externo',
    status: 'em_aberto',
    deleted_at: null,
    fornecedor_id: 5,
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

  /**
   * A recusa agora é da allowlist, antes do banco: nem o SELECT de idempotência
   * roda. Isso é o oposto do gate antigo, que precisava da linha em mãos para
   * decidir — e por isso não valia para pedido interno.
   */
  it.each([
    ['interno'],
    ['externo'],
  ])('v1 rejeita status em pedido %s, sem tocar no banco', async (origem) => {
    const { service, query } = makeService([[pedido({ origem })]], pedido({ origem }));
    const response = await pushV1(service, { status: 'liberado' });

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('controlados pelo servidor');
    expect(response.results[0].message).toContain('status');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['total_sem_imposto', { total_sem_imposto: 10 }],
    ['total_com_imposto', { total_com_imposto: 10 }],
  ])('v1 rejeita %s como campo derivado e diz o que mandar no lugar', async (campo, payload) => {
    const { service, query } = makeService([[pedido()]], pedido());
    const response = await pushV1(service, payload);

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('derivados');
    expect(response.results[0].message).toContain(campo);
    // A mensagem tem que ensinar o caminho, senão o device fica em retry eterno.
    expect(response.results[0].message).toContain('Envie os insumos');
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['interno'],
    ['externo'],
  ])('v1 recusa editar pedido %s fora de em_aberto', async (origem) => {
    const linha = pedido({ origem, status: 'faturado' });
    const { service, query } = makeService([[linha]], linha);
    const response = await pushV1(service, { observacao: 'tarde demais' });

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('em_aberto');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('v1 edita campo livre de pedido em em_aberto e avança a version', async () => {
    const linha = pedido({ origem: 'interno' });
    const { service, query } = makeService([[linha], []], linha);
    const response = await pushV1(service, { observacao: 'ok' });

    expect(response.results[0]).toMatchObject({ status: 'ok' });
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
    expect(update?.[0]).toContain('version = version + 1');
  });

  // CREATE não tem linha para consultar: a allowlist barra igual, e o caminho de
  // criação legítimo continua intacto.
  it('v1 rejeita CREATE que traga status ou total', async () => {
    const { service, query } = makeService([]);
    const response = await service.pushItems(
      [{
        uuid: UUID,
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.CREATE,
        payload: { status: 'em_aberto', total_com_imposto: 100 },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(query).not.toHaveBeenCalled();
  });

  it('v1 segue criando pedido com os campos livres', async () => {
    const { service, query } = makeService([[], [{ numero: 7 }], [{ id: 10 }]]);
    const response = await service.pushItems(
      [{
        uuid: UUID,
        entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.CREATE,
        payload: { observacao: 'do celular', pgt: 'a vista' },
      }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'ok', numero_pedido: 7 });
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('INSERT'))).toBe(true);
  });

  it.each([
    ['status', { status: 'liberado' }],
    ['total_com_imposto', { total_com_imposto: 10 }],
  ])('v2 rejeita %s em pedido interno como não-retryable', async (campo, payload) => {
    const linha = pedido({ origem: 'interno' });
    const { service } = makeService([[], [], [], [linha], [], []], linha);
    const response = await pushV2(service, payload);

    expect(response.results[0]).toMatchObject({
      status: 'rejected', code: 'VALIDATION_FAILED', retryable: false,
    });
    expect(response.results[0].message).toContain(campo);
  });

  it('v2 recusa editar pedido fora de em_aberto', async () => {
    const linha = pedido({ origem: 'interno', status: 'liberado' });
    const { service } = makeService([[], [], [], [linha], [], []], linha);
    const response = await pushV2(service, { observacao: 'tarde demais' });

    expect(response.results[0]).toMatchObject({
      status: 'rejected', code: 'VALIDATION_FAILED', retryable: false,
    });
    expect(response.results[0].message).toContain('em_aberto');
  });

  it('v2 aplica edição de campo livre em pedido em_aberto', async () => {
    const linha = pedido({ origem: 'interno' });
    const { service } = makeService([
      [], [], [], [linha], [{ version: 4 }], [],
    ], linha);
    const response = await pushV2(service, { observacao: 'ok' });

    expect(response.results[0]).toMatchObject({ status: 'applied', version: 4 });
  });

  /**
   * PROB-0063 pela porta do sync: o DELETE do v1 não lia a linha, então nenhuma
   * guarda rodava — nem a de nota fiscal ativa, que a REST sempre teve.
   */
  it('v1 recusa excluir pedido com nota fiscal ativa', async () => {
    const linha = pedido({ origem: 'interno' });
    const { service, query } = makeService([[{ total: 1 }]], linha);
    const response = await service.pushItems(
      [{ uuid: UUID, entity: SyncEntity.PEDIDOS, operation: SyncOperation.DELETE, payload: {} }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'error' });
    expect(response.results[0].message).toContain('notas fiscais ativas');
    expect(query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE'))).toBe(false);
  });

  it('v1 exclui pedido sem nota fiscal ativa', async () => {
    const linha = pedido({ origem: 'interno' });
    const { service, query } = makeService([[{ total: 0 }], []], linha);
    const response = await service.pushItems(
      [{ uuid: UUID, entity: SyncEntity.PEDIDOS, operation: SyncOperation.DELETE, payload: {} }],
      'tenant-1',
    );

    expect(response.results[0]).toMatchObject({ status: 'ok' });
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE'));
    expect(update?.[0]).toContain('deleted_at = NOW()');
  });
});
