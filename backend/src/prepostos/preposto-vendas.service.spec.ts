import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrepostoVendasService } from './preposto-vendas.service';
import { PrepostoComissao } from './entities/preposto-comissao.entity';
import { Preposto } from './entities/preposto.entity';
import { FinanceMovement } from '../finance/entities/finance-movement.entity';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';
import { PagamentoVendaDto } from './dto/preposto-vendas.dto';

const tenantId = 'tenant-a';
const uuid = '99999999-9999-4999-8999-999999999999';

function venda(overrides: Partial<PrepostoComissao> = {}): PrepostoComissao {
  return {
    id: 3, uuid, tenant_id: tenantId, version: 2, preposto_id: 7, pedido_id: 1, nota_fiscal_id: 5,
    numero_nfe: 'NF-9', valor_faturado: '1000.00', perc_comissao: '3.00', valor_comissao: '30.00',
    status: 'pendente', data_pagamento: null, movimento_id: null, ...overrides,
  } as PrepostoComissao;
}

function subject(current: PrepostoComissao | null) {
  const vendaRepo = {
    findOne: jest.fn().mockResolvedValue(current),
    findOneOrFail: jest.fn().mockResolvedValue(current),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const movimentoRepo = {
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ ...v, id: 44 })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const prepostoRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, nome: 'Paula' }) };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === PrepostoComissao) return vendaRepo;
      if (entity === FinanceMovement) return movimentoRepo;
      if (entity === Preposto) return prepostoRepo;
      throw new Error('repo não mockado');
    }),
  };
  const dataSource = { transaction: jest.fn((work: any) => work(manager)) };
  return { vendaRepo, movimentoRepo, service: new PrepostoVendasService({} as any, dataSource as any) };
}

describe('PrepostoVendasService — pagamento', () => {
  it('pagar cria saída Custo Rotativo no Financeiro e grava o vínculo, com a venda travada', async () => {
    const { vendaRepo, movimentoRepo, service } = subject(venda());
    await service.registrarPagamento(uuid, { data_pagamento: '2026-10-10', version: 2 }, tenantId);

    expect(vendaRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(movimentoRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: tenantId, tipo: 'Custo Rotativo', valor: '30.00', data: '2026-10-10',
      descricao: 'Comissão preposto Paula – NF NF-9',
    }));
    expect(vendaRepo.update).toHaveBeenCalledWith(
      { id: 3, tenant_id: tenantId },
      expect.objectContaining({ status: 'pago', data_pagamento: '2026-10-10', movimento_id: 44 }),
    );
  });

  it('não paga duas vezes nem paga comissão zerada', async () => {
    const paga = subject(venda({ status: 'pago', movimento_id: 44, data_pagamento: '2026-10-10' }));
    await expect(paga.service.registrarPagamento(uuid, { data_pagamento: '2026-10-11', version: 2 }, tenantId))
      .rejects.toBeInstanceOf(ConflictException);
    expect(paga.movimentoRepo.save).not.toHaveBeenCalled();

    const zerada = subject(venda({ valor_comissao: '0.00' }));
    await expect(zerada.service.registrarPagamento(uuid, { data_pagamento: '2026-10-11', version: 2 }, tenantId))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('estornar volta a pendente e apaga a saída do Financeiro', async () => {
    const { vendaRepo, movimentoRepo, service } = subject(venda({ status: 'pago', movimento_id: 44, data_pagamento: '2026-10-10' }));
    await service.registrarPagamento(uuid, { data_pagamento: null, version: 2 }, tenantId);

    expect(vendaRepo.update).toHaveBeenCalledWith(
      { id: 3, tenant_id: tenantId },
      expect.objectContaining({ status: 'pendente', data_pagamento: null, movimento_id: null }),
    );
    expect(movimentoRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 44, tenant_id: tenantId }),
      expect.objectContaining({ deleted_at: expect.any(Function) }),
    );
  });

  it('estornar o que não está pago é 409; versão obsoleta e outro tenant também barram', async () => {
    await expect(subject(venda()).service.registrarPagamento(uuid, { data_pagamento: null, version: 2 }, tenantId))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(subject(venda({ version: 5 })).service.registrarPagamento(uuid, { data_pagamento: '2026-10-10', version: 2 }, tenantId))
      .rejects.toBeInstanceOf(ConcurrentModificationException);
    await expect(subject(null).service.registrarPagamento(uuid, { data_pagamento: '2026-10-10', version: 2 }, tenantId))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PrepostoVendasService — percentual', () => {
  it('recalcula sobre o valor da nota', async () => {
    const { vendaRepo, service } = subject(venda());
    await service.alterarPercentual(uuid, { perc_comissao: 4.5, version: 2 }, tenantId);
    expect(vendaRepo.update).toHaveBeenCalledWith(
      { id: 3, tenant_id: tenantId },
      expect.objectContaining({ perc_comissao: '4.50', valor_comissao: '45.00' }),
    );
  });

  it('venda paga não muda percentual', async () => {
    const { vendaRepo, service } = subject(venda({ status: 'pago', movimento_id: 44, data_pagamento: '2026-10-10' }));
    await expect(service.alterarPercentual(uuid, { perc_comissao: 4.5, version: 2 }, tenantId)).rejects.toBeInstanceOf(ConflictException);
    expect(vendaRepo.update).not.toHaveBeenCalled();
  });
});

describe('PrepostoVendasService — listagem', () => {
  function listSubject() {
    const qb: any = {};
    for (const m of ['innerJoin', 'leftJoin', 'where', 'andWhere', 'select', 'addSelect', 'orderBy', 'addOrderBy', 'offset', 'limit']) {
      qb[m] = jest.fn().mockReturnValue(qb);
    }
    const clones: any[] = [];
    qb.clone = jest.fn(() => {
      const c: any = { ...qb, andWhere: jest.fn().mockReturnThis() };
      c.select = jest.fn().mockReturnValue(c);
      c.addSelect = jest.fn().mockReturnValue(c);
      c.getRawOne = jest.fn().mockResolvedValue({ faturado: '1000', comissao_pendente: '30', comissao_paga: '12.5' });
      c.getCount = jest.fn().mockResolvedValue(1);
      clones.push(c);
      return c;
    });
    qb.getRawMany = jest.fn().mockResolvedValue([{
      uuid, version: 2, status: 'pendente', numero_nfe: 'NF-9', data_faturamento: '2026-10-01', data_pagamento: null,
      valor_faturado: '1000', perc_comissao: '3', valor_comissao: '30', preposto_uuid: 'p1', preposto_nome: 'Paula',
      pedido_uuid: 'ped', numero_pedido: 42, cliente: 'Cliente',
    }]);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    return { qb, clones, service: new PrepostoVendasService(repo as any, {} as any) };
  }

  it('sempre filtra pelo tenant e devolve totais no meta', async () => {
    const { qb, service } = listSubject();
    const result = await service.list(tenantId, { page: 1, limit: 20, preposto_uuid: 'p1', status: 'pendente' });
    expect(qb.where).toHaveBeenCalledWith('v.tenant_id = :tenantId', { tenantId });
    expect(qb.andWhere).toHaveBeenCalledWith('v.deleted_at IS NULL');
    expect(result.meta.totais).toEqual({ faturado: '1000.00', comissao_pendente: '30.00', comissao_paga: '12.50' });
    expect(result.data[0]).toEqual(expect.objectContaining({
      valor_comissao: '30.00', perc_comissao: '3.00', pedido: { uuid: 'ped', numero_pedido: 42, cliente: 'Cliente' },
    }));
  });

  it('recusa período incompleto ou invertido', async () => {
    const { service } = listSubject();
    await expect(service.list(tenantId, { data_inicio: '2026-10-01' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(tenantId, { data_inicio: '2026-10-02', data_fim: '2026-10-01' } as any)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PagamentoVendaDto', () => {
  it('aceita data ou null (estorno) e recusa data inválida', async () => {
    const pipe = { whitelist: true, forbidNonWhitelisted: true };
    expect(await validate(plainToInstance(PagamentoVendaDto, { data_pagamento: '2026-10-10', version: 1 }), pipe)).toEqual([]);
    expect(await validate(plainToInstance(PagamentoVendaDto, { data_pagamento: null, version: 1 }), pipe)).toEqual([]);
    const ruim = await validate(plainToInstance(PagamentoVendaDto, { data_pagamento: '10/10/2026', version: 1 }), pipe);
    expect(ruim.map((e) => e.property)).toEqual(['data_pagamento']);
  });
});
