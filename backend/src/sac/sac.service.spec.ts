import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SacService } from './sac.service';
import { CreateSacTicketDto, UpdateSacTicketDto } from './dto/create-sac-ticket.dto';
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

describe('SacService.create', () => {
  it('consome a sequence própria, nasce aberto e deriva o total dos itens', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([{ id: 10, numero: 77 }]),
      create: jest.fn((_entity: unknown, values: Record<string, unknown>) => ({ ...values })),
      save: jest.fn(async (value: unknown) => (Array.isArray(value) ? value : { ...(value as object), id: 1, uuid: chamadoUuid })),
    };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);
    const reloaded = { uuid: chamadoUuid };
    jest.spyOn(service, 'findOne').mockResolvedValue(reloaded as any);

    await expect(service.create(validBody as CreateSacTicketDto, admin)).resolves.toBe(reloaded);

    // Sequence própria — não compartilha numeração com pedidos.
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("nextval('sac_numero_seq')"));
    expect(manager.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      numero_chamado: 77, status: 'aberto', numero_nfe: '12345',
    }));
    // 2×10 + 1×5,50
    const chamadoSalvo = manager.save.mock.calls.at(-1)?.[0] as { total: string };
    expect(chamadoSalvo.total).toBe('25.50');
  });

  it('rejeita cliente de outro tenant', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) };
    const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
    const service = new SacService({} as any, dataSource);

    await expect(service.create(validBody as CreateSacTicketDto, admin))
      .rejects.toBeInstanceOf(BadRequestException);
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
