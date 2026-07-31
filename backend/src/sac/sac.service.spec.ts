import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SacService } from './sac.service';
import { CreateSacTicketDto, UpdateSacTicketDto } from './dto/create-sac-ticket.dto';
import { ListSacQueryDto } from './dto/query-sac.dto';
import { RequestUser } from '../common/types/jwt-payload.type';

const admin: RequestUser = {
  sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'tenant-a',
  tenantSubdomain: 'tenant-a',
  roles: ['ADMIN'],
  plan: 'pro',
  tokenVersion: 1,
  jti: 'jti-a',
};

const chamadoUuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function queryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'leftJoinAndSelect', 'where', 'andWhere', 'update', 'set', 'returning', 'orderBy', 'skip', 'take']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  return Object.assign(builder, overrides);
}

const validBody = {
  uuid: chamadoUuid,
  cliente_uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  fornecedor_uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  numero_nfe: '12345',
  itens: [
    { uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', codigo: 'ABC-1', quantidade: 2, motivo: 'Avaria', valor_unitario: 10 },
    { uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff', codigo: 'ABC-2', quantidade: 1, motivo: 'Falta', valor_unitario: 5.5 },
  ],
};

/**
 * Roteia o `manager.query` por trecho do SQL. Um mock único devolvendo sempre a
 * mesma linha faria a guarda de uuid enxergar chamado existente e recusar tudo.
 */
function managerDeCreate(overrides: { uuidOcupado?: boolean; itemOcupado?: boolean; ultimo?: number } = {}) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('FROM chamados_sac')) return overrides.uuidOcupado ? [{ '?column?': 1 }] : [];
    if (sql.includes('FROM itens_chamado_sac')) {
      return overrides.itemOcupado ? [{ uuid: validBody.itens[0].uuid }] : [];
    }
    if (sql.includes('sac_numero_contador')) return [{ ultimo: overrides.ultimo ?? 77 }];
    return [{ id: 10 }];
  });
  return {
    query,
    create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({ ...values })),
    save: jest.fn(async (value: unknown) => (Array.isArray(value) ? value : { ...(value as object), id: 1, uuid: chamadoUuid })),
  };
}

describe('SacService.create', () => {
  it('numera pelo contador do tenant, nasce aberto e deriva o total dos itens', async () => {
    const manager = managerDeCreate();
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);
    const reloaded = { uuid: chamadoUuid };
    jest.spyOn(service, 'findOne').mockResolvedValue(reloaded as any);

    await expect(service.create(validBody as CreateSacTicketDto, admin)).resolves.toBe(reloaded);

    // Numeração por tenant: UPSERT atômico no contador, nunca a sequence global.
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('sac_numero_contador'),
      ['tenant-a'],
    );
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining("nextval('sac_numero_seq')"));
    // 2×10 + 1×5,50, gravado no PRIMEIRO save: chamado novo nasce com version 1.
    expect(manager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      numero_chamado: 77, status: 'aberto', numero_nfe: '12345', total: '25.50',
    }));
    const primeiroSave = manager.save.mock.calls[0]?.[0] as { total: string };
    expect(primeiroSave.total).toBe('25.50');
    expect(manager.save.mock.calls.filter((call) => !Array.isArray(call[0]))).toHaveLength(1);
  });

  it('recusa uuid de chamado já cadastrado em vez de deixar o INSERT estourar', async () => {
    const manager = managerDeCreate({ uuidOcupado: true });
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);

    await expect(service.create(validBody as CreateSacTicketDto, admin))
      .rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('recusa uuid de item que já pertence a outro chamado', async () => {
    const manager = managerDeCreate({ itemOcupado: true });
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);

    await expect(service.create(validBody as CreateSacTicketDto, admin))
      .rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('cada tenant recebe o próximo número do seu próprio contador', async () => {
    const managerA = managerDeCreate({ ultimo: 1 });
    const managerB = managerDeCreate({ ultimo: 1 });
    for (const [manager, tenantId] of [[managerA, 'tenant-a'], [managerB, 'tenant-b']] as const) {
      const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
      const service = new SacService({} as any, dataSource);
      jest.spyOn(service, 'findOne').mockResolvedValue({ uuid: chamadoUuid } as any);
      await service.create(validBody as CreateSacTicketDto, { ...admin, tenantId });
      expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('sac_numero_contador'), [tenantId]);
      expect(manager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        numero_chamado: 1, tenant_id: tenantId,
      }));
    }
  });

  it('rejeita cliente de outro tenant', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);

    await expect(service.create(validBody as CreateSacTicketDto, admin))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('SacService.findAll', () => {
  function serviceParaLista() {
    const qb = queryBuilder({ getManyAndCount: jest.fn().mockResolvedValue([[], 0]) });
    const ticketRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
    return { service: new SacService(ticketRepo, {} as any), qb };
  }

  // Status inválido devolvia 200 com lista vazia — indistinguível de "não há
  // chamados".
  it('recusa status fora do enum', async () => {
    const { service } = serviceParaLista();

    await expect(service.findAll('tenant-a', { page: 1, limit: 20 }, 'resolvidoo'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita status do enum', async () => {
    const { service, qb } = serviceParaLista();

    await service.findAll('tenant-a', { page: 1, limit: 20 }, 'resolvido');

    expect(qb.andWhere).toHaveBeenCalledWith('c.status = :status', { status: 'resolvido' });
  });

  // PROB-0081: `status` era `@Query('status')` solto e o `forbidNonWhitelisted`
  // global devolvia 400 antes do service. A asserção de mensagem é o que
  // distingue "enum recusou" de "whitelist recusou".
  describe('ListSacQueryDto — filtro chega ao service e nomeia o enum', () => {
    const pipeOptions = { whitelist: true, forbidNonWhitelisted: true };

    it('aceita status do enum', async () => {
      expect(await validate(plainToInstance(ListSacQueryDto, { status: 'aberto' }), pipeOptions)).toEqual([]);
    });

    it('recusa status fora do enum com a mensagem do enum', async () => {
      const errors = await validate(plainToInstance(ListSacQueryDto, { status: 'resolvidoo' }), pipeOptions);

      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('status');
      expect(Object.values(errors[0].constraints ?? {}).join(' ')).toContain('Status inválido. Use um de:');
    });
  });
});

describe('SacService.updateStatus', () => {
  function serviceComChamado(status: string) {
    const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1, raw: [{ status }] }) });
    const ticketRepo = { createQueryBuilder: jest.fn((alias?: string) => (alias ? queryBuilder() : updateBuilder)) } as any;
    const service = new SacService(ticketRepo, {} as any);
    jest.spyOn(service, 'findOne')
      .mockResolvedValueOnce({ id: 1, uuid: chamadoUuid, status } as any)
      .mockResolvedValueOnce({ uuid: chamadoUuid, status: 'x' } as any);
    return { service, updateBuilder };
  }

  it.each([
    ['aberto', 'em_andamento'],
    ['aberto', 'resolvido'],
    ['aberto', 'cancelado'],
    ['em_andamento', 'resolvido'],
    ['em_andamento', 'cancelado'],
  ])('permite %s -> %s', async (de, para) => {
    const { service } = serviceComChamado(de);
    await expect(service.updateStatus(chamadoUuid, para, 1, admin)).resolves.toBeDefined();
  });

  // Resolvido/cancelado são terminais: reabrir exigiria outro chamado, senão o
  // histórico de atendimento fica ambíguo.
  it.each([
    ['resolvido', 'aberto'],
    ['resolvido', 'em_andamento'],
    ['cancelado', 'aberto'],
    ['em_andamento', 'aberto'],
  ])('bloqueia %s -> %s com 409', async (de, para) => {
    const { service, updateBuilder } = serviceComChamado(de);
    await expect(service.updateStatus(chamadoUuid, para, 1, admin)).rejects.toBeInstanceOf(ConflictException);
    expect(updateBuilder.execute).not.toHaveBeenCalled();
  });

  it('rejeita status fora do enum antes de tocar o banco', async () => {
    const ticketRepo = { createQueryBuilder: jest.fn() } as any;
    const service = new SacService(ticketRepo, {} as any);

    await expect(service.updateStatus(chamadoUuid, 'faturado', 1, admin))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(ticketRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('propaga 404 de chamado de outro tenant', async () => {
    const service = new SacService({ createQueryBuilder: jest.fn() } as any, {} as any);
    jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

    await expect(service.updateStatus(chamadoUuid, 'resolvido', 1, admin))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SacService.update', () => {
  function managerComChamado(chamado: Record<string, unknown>, itensExistentes: unknown[] = []) {
    const ticketRepo = { findOne: jest.fn().mockResolvedValue(chamado), save: jest.fn(async (v: unknown) => v) };
    const itemRepo = {
      find: jest.fn().mockResolvedValue(itensExistentes),
      save: jest.fn(async (v: unknown) => v),
      create: jest.fn((values: unknown) => values),
      softRemove: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity: { name: string }) => (entity.name === 'SacTicket' ? ticketRepo : itemRepo)),
      query: jest.fn().mockResolvedValue([{ id: 10 }]),
    };
    return { manager, ticketRepo, itemRepo };
  }

  it('bloqueia edição de chamado resolvido (409)', async () => {
    const { manager, ticketRepo } = managerComChamado({
      id: 1, uuid: chamadoUuid, tenant_id: 'tenant-a', version: 1, status: 'resolvido',
    });
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);

    await expect(
      service.update(chamadoUuid, { ...validBody, version: 1 } as UpdateSacTicketDto, admin),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  // Sem esta guarda o upsert por uuid sequestraria um item de outro chamado.
  it('rejeita uuid de item que já pertence a outro chamado', async () => {
    const { manager } = managerComChamado({
      id: 1, uuid: chamadoUuid, tenant_id: 'tenant-a', version: 1, status: 'aberto',
    });
    manager.query = jest.fn()
      .mockResolvedValueOnce([{ id: 10 }])                                  // cliente
      .mockResolvedValueOnce([{ id: 11 }])                                  // fornecedor
      .mockResolvedValueOnce([{ tenant_id: 'tenant-a', chamado_id: 999 }]); // colisão
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);

    await expect(
      service.update(chamadoUuid, { ...validBody, version: 1 } as UpdateSacTicketDto, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DTO do chamado', () => {
  const pipeOptions = { whitelist: true, forbidNonWhitelisted: true };

  it('aceita o corpo válido', async () => {
    const errors = await validate(plainToInstance(CreateSacTicketDto, validBody), pipeOptions);
    expect(errors).toEqual([]);
  });

  it('rejeita `status`, `total` e `numero_chamado` no corpo (derivados)', async () => {
    const dto = plainToInstance(CreateSacTicketDto, {
      ...validBody, status: 'resolvido', total: '1.00', numero_chamado: 5,
    });
    const errors = await validate(dto, pipeOptions);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['status', 'total', 'numero_chamado']),
    );
  });

  it('rejeita `valor_total` no item (derivado de quantidade × valor unitário)', async () => {
    const dto = plainToInstance(CreateSacTicketDto, {
      ...validBody,
      itens: [{ ...validBody.itens[0], valor_total: '999.00' }],
    });
    const errors = await validate(dto, pipeOptions);

    expect(JSON.stringify(errors)).toContain('valor_total');
  });

  it('exige pelo menos um item', async () => {
    const dto = plainToInstance(CreateSacTicketDto, { ...validBody, itens: [] });
    const errors = await validate(dto, pipeOptions);

    expect(errors.map((error) => error.property)).toContain('itens');
  });

  it('exige código, motivo, quantidade e valor em cada item', async () => {
    const dto = plainToInstance(CreateSacTicketDto, {
      ...validBody,
      itens: [{ uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }],
    });
    const errors = await validate(dto, pipeOptions);

    const serializado = JSON.stringify(errors);
    for (const campo of ['codigo', 'motivo', 'quantidade', 'valor_unitario']) {
      expect(serializado).toContain(campo);
    }
  });
});

/**
 * BACKLOG-0055, lado do SAC: excluído o chamado, `itens_chamado_sac` ficava com
 * `deleted_at IS NULL`. Mesma causa do lado de pedidos — FK `NO ACTION` e soft
 * delete de uma linha só.
 */
describe('SacService.remove — cascata de soft delete', () => {
  function subject(affected: number) {
    const updateBuilder = queryBuilder({
      execute: jest.fn().mockResolvedValue({ affected }),
    });
    const lookupBuilder = queryBuilder({ getRawOne: jest.fn().mockResolvedValue(undefined) });
    const ticketRepo = {
      createQueryBuilder: jest.fn((alias?: string) => (alias ? lookupBuilder : updateBuilder)),
    } as any;

    const query = jest.fn().mockResolvedValue([]);
    const manager = { query, getRepository: () => ticketRepo };
    const transaction = jest.fn((cb: (m: unknown) => unknown) => cb(manager));

    const service = new SacService(ticketRepo, { transaction } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 9, uuid: chamadoUuid } as any);

    return { service, query, transaction };
  }

  const itensUpdate = (query: jest.Mock) => query.mock.calls
    .find(([sql]) => String(sql).includes('UPDATE itens_chamado_sac'));

  it('marca os itens do chamado junto com o chamado', async () => {
    const { service, query } = subject(1);

    await service.remove(chamadoUuid, 1, admin);

    const chamada = itensUpdate(query);
    expect(chamada).toBeDefined();
    expect(chamada?.[0]).toContain('deleted_at = CURRENT_TIMESTAMP');
    expect(chamada?.[0]).toContain('version = version + 1');
    expect(chamada?.[0]).toContain('deleted_at IS NULL');
    expect(chamada?.[1]).toEqual([admin.tenantId, 9]);
  });

  it('não marca os itens quando o soft delete do chamado falha', async () => {
    const { service, query } = subject(0);

    await expect(service.remove(chamadoUuid, 1, admin)).rejects.toBeInstanceOf(NotFoundException);
    expect(itensUpdate(query)).toBeUndefined();
  });
});
