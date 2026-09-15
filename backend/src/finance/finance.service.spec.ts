import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';

function chainableQueryBuilder(finalValue: unknown, finalMethod: 'getRawOne' | 'getMany' = 'getRawOne') {
  const qb: any = {};
  for (const method of ['select', 'where', 'andWhere', 'orderBy']) qb[method] = jest.fn().mockReturnValue(qb);
  qb[finalMethod] = jest.fn().mockResolvedValue(finalValue);
  return qb;
}

function optimisticWriteBuilder(overrides: Record<string, jest.Mock> = {}) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere', 'update', 'set', 'returning']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  return Object.assign(builder, overrides);
}

describe('FinanceService tenant supplier validation', () => {
  const movementRepo = {} as any;
  const commissionRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  } as any;
  const delinquencyRepo = {} as any;
  const partnerRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  } as any;
  const dataSource = { query: jest.fn() } as any;
  const service = new FinanceService(
    movementRepo,
    commissionRepo,
    delinquencyRepo,
    partnerRepo,
    dataSource,
  );

  beforeEach(() => jest.clearAllMocks());

  it('persists a commission only when supplier belongs to tenant', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 42 }]);

    const result = await service.createComissao({
      uuid: '73a301b7-66f2-49b6-9130-783d5de2497e',
      fornecedor_id: 42,
      valor_comissao: '10.00',
    }, 'tenant-a');

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $2'),
      [42, 'tenant-a'],
    );
    expect(result.fornecedor_id).toBe(42);
  });

  it('rejects a supplier from another tenant', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(service.createComissao({
      uuid: '73a301b7-66f2-49b6-9130-783d5de2497e',
      fornecedor_id: 42,
      valor_comissao: '10.00',
    }, 'tenant-b')).rejects.toBeInstanceOf(NotFoundException);

    expect(commissionRepo.save).not.toHaveBeenCalled();
  });

  it('allows an omitted optional supplier without querying suppliers', async () => {
    const result = await service.createParceiro({
      uuid: '73a301b7-66f2-49b6-9130-783d5de2497e',
      nome_parceiro: 'Parceiro',
      data_pedido: '2026-07-12',
      valor_comissao: '10.00',
    }, 'tenant-a');

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(result.fornecedor_id).toBeNull();
  });
});

describe('FinanceService — notas faturadas', () => {
  it('lista notas diretamente, com data efetiva e isolamento por tenant', async () => {
    const qb: any = {};
    for (const method of ['innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'orderBy', 'addOrderBy', 'skip', 'take', 'offset', 'limit']) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getCount = jest.fn().mockResolvedValue(1);
    qb.getRawMany = jest.fn().mockResolvedValue([{ uuid: 'nota-1', numero_nota: '123', valor: '40.00' }]);
    const dataSource = { getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => qb) })) } as any;
    const service = new FinanceService({} as any, {} as any, {} as any, {} as any, dataSource);

    const result = await service.findFaturados('tenant-a', { page: 3, limit: 20 }, {
      mes: 9, ano: 2026, fornecedor_uuid: 'forn-1', search: '123',
    });

    // getRawMany com join ignora skip/take no TypeORM: paginação precisa de offset/limit.
    expect(qb.offset).toHaveBeenCalledWith(40);
    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.take).not.toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining("AT TIME ZONE 'America/Sao_Paulo'"), { mes: 9 });

    expect(result.data).toEqual([{ uuid: 'nota-1', numero_nota: '123', valor: '40.00' }]);
    expect(qb.where).toHaveBeenCalledWith('n.tenant_id = :tenantId', { tenantId: 'tenant-a' });
    expect(qb.andWhere).toHaveBeenCalledWith('fornecedor.uuid = :fornecedorUuid', { fornecedorUuid: 'forn-1' });
    expect(qb.select).toHaveBeenCalledWith(expect.arrayContaining([
      expect.stringMatching(/^TO_CHAR\(COALESCE\(n\.data_emissao.*'YYYY-MM-DD'\) AS data_faturamento$/),
      'n.valor AS valor',
    ]));
  });
});

describe('FinanceService — listagem de comissões', () => {
  it('ordena pela data de faturamento via alias (expressão no orderBy quebra skip/take com join)', async () => {
    const qb: any = {};
    for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'addSelect', 'orderBy', 'skip', 'take']) {
      qb[method] = jest.fn().mockReturnValue(qb);
    }
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    const commissionRepo = { createQueryBuilder: jest.fn(() => qb) } as any;
    const service = new FinanceService({} as any, commissionRepo, {} as any, {} as any, {} as any);

    await service.findAllComissoes('tenant-a', { page: 1, limit: 50 }, { mes: 9, ano: 2026 });

    expect(qb.addSelect).toHaveBeenCalledWith('COALESCE(c.data_faturamento, c.data_pedido)', 'data_ordem');
    expect(qb.orderBy).toHaveBeenCalledWith('data_ordem', 'DESC');
    expect(qb.orderBy).not.toHaveBeenCalledWith(expect.stringContaining('('), expect.anything());
  });
});

describe('FinanceService — comissão por nota (percentual/pagamento) e fluxo de caixa', () => {
  const tenantId = 'tenant-a';
  const uuid = 'a1a1a1a1-1111-1111-1111-111111111111';

  function buildServiceWithCommissionRepo(commissionRepo: any, dataSourceOverrides: Record<string, jest.Mock> = {}) {
    const movementRepo = { createQueryBuilder: jest.fn() } as any;
    const dataSource = { query: jest.fn(), ...dataSourceOverrides } as any;
    return new FinanceService(movementRepo, commissionRepo, {} as any, {} as any, dataSource);
  }

  describe('informarPercentual', () => {
    it('calcula valor_comissao sobre o valor da nota vinculada e muda para faturado', async () => {
      const updateBuilder = optimisticWriteBuilder({
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [{ uuid, status: 'faturado', valor_comissao: '20.00' }] }),
      });
      const lookupBuilder = optimisticWriteBuilder();
      const commissionRepo = {
        findOne: jest.fn().mockResolvedValue({ uuid, status: 'pendente', notaFiscal: { valor: '200.00' } }),
        createQueryBuilder: jest.fn((alias?: string) => (alias ? lookupBuilder : updateBuilder)),
      };
      const service = buildServiceWithCommissionRepo(commissionRepo);

      await service.informarPercentual(uuid, '10.00', 1, tenantId);

      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ valor_comissao: '20.00', status: 'faturado', perc_comissao: '10.00' }),
      );
    });

    it('exige status pendente antes de informar percentual', async () => {
      const commissionRepo = {
        findOne: jest.fn().mockResolvedValue({ uuid, status: 'faturado' }),
      };
      const service = buildServiceWithCommissionRepo(commissionRepo);

      await expect(service.informarPercentual(uuid, '10.00', 1, tenantId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 quando a comissão não existe no tenant', async () => {
      const commissionRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const service = buildServiceWithCommissionRepo(commissionRepo);

      await expect(service.informarPercentual(uuid, '10.00', 1, tenantId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('registrarPagamento', () => {
    it('exige data de pagamento', async () => {
      const commissionRepo = { findOne: jest.fn() };
      const service = buildServiceWithCommissionRepo(commissionRepo);

      await expect(service.registrarPagamento(uuid, '', 1, tenantId)).rejects.toBeInstanceOf(BadRequestException);
      expect(commissionRepo.findOne).not.toHaveBeenCalled();
    });

    it('exige status faturado antes de registrar pagamento', async () => {
      const commissionRepo = { findOne: jest.fn().mockResolvedValue({ uuid, status: 'pendente' }) };
      const service = buildServiceWithCommissionRepo(commissionRepo);

      await expect(service.registrarPagamento(uuid, '2026-07-20', 1, tenantId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('registra pagamento e muda status para pago', async () => {
      const updateBuilder = optimisticWriteBuilder({
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [{ uuid, status: 'pago' }] }),
      });
      const lookupBuilder = optimisticWriteBuilder();
      const commissionRepo = {
        findOne: jest.fn().mockResolvedValue({ uuid, status: 'faturado' }),
        createQueryBuilder: jest.fn((alias?: string) => (alias ? lookupBuilder : updateBuilder)),
      };
      const service = buildServiceWithCommissionRepo(commissionRepo);

      await service.registrarPagamento(uuid, '2026-07-20', 1, tenantId);

      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ data_pagamento: '2026-07-20', status: 'pago' }),
      );
    });
  });

  describe('getFluxoCaixa', () => {
    it('separa faturamento bruto (notas por data_emissao) de caixa (comissões pagas por data_pagamento)', async () => {
      const movementRepo = { createQueryBuilder: jest.fn(() => chainableQueryBuilder([], 'getMany')) } as any;
      const commissaoQb = chainableQueryBuilder({ total: '30.00' });
      const commissionRepo = { createQueryBuilder: jest.fn(() => commissaoQb) } as any;
      const dataSource = { query: jest.fn().mockResolvedValue([{ total: '500.00' }]) } as any;
      const service = new FinanceService(movementRepo, commissionRepo, {} as any, {} as any, dataSource);

      const result = await service.getFluxoCaixa(tenantId, 7, 2026);

      expect(result.receitas).toBe('30.00');
      expect(result.faturamentoBruto).toBe('500.00');
      expect(commissaoQb.andWhere).toHaveBeenCalledWith(expect.stringContaining("c.status = 'pago'"));
      expect(commissaoQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('c.data_pagamento'),
        expect.anything(),
      );
      expect(commissaoQb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('data_faturamento'),
        expect.anything(),
      );
      expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('notas_fiscais'), [tenantId, 7, 2026]);
    });
  });
});
