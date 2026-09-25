import { ConflictException, NotFoundException } from '@nestjs/common';
import { FaturamentoService } from './faturamento.service';
import { Order } from '../orders/entities/order.entity';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { Commission } from '../finance/entities/commission.entity';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';
import { FaturamentoFinalizacao } from './entities/faturamento-finalizacao.entity';
import { FinalizarFaturamentoDto, ReabrirFaturamentoDto } from './dto/finalizar-faturamento.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const tenantId = 'tenant-a';
const pedidoUuid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    uuid: pedidoUuid,
    tenant_id: tenantId,
    status: 'liberado',
    cliente_id: 2,
    fornecedor_id: 3,
    numero_pedido: 10,
    version: 1,
    data: '2026-01-01',
    total_com_imposto: '100.00',
    total_sem_imposto: null,
    ...overrides,
  } as Order;
}

function sumQueryBuilder(total: string) {
  const qb: any = {};
  for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn().mockReturnValue(qb);
  qb.getRawOne = jest.fn().mockResolvedValue({ total });
  return qb;
}

function buildRepos({ order, notaSumAfter, existingNota = null }: { order: Order; notaSumAfter: string; existingNota?: any }) {
  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(order),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const notaRepo = {
    findOne: jest.fn().mockResolvedValue(existingNota),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ ...v, id: v.id ?? 5 })),
    createQueryBuilder: jest.fn(() => sumQueryBuilder(notaSumAfter)),
    softRemove: jest.fn(async (v: any) => v),
  };
  const commissionRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => v),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    softRemove: jest.fn(async (v: any) => v),
  };
  const finalizacaoRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => ({ ...v, id: v.id ?? 9, version: v.version ?? 1 })),
  };
  return { orderRepo, notaRepo, commissionRepo, finalizacaoRepo };
}

function buildService(repos: { orderRepo: any; notaRepo: any; commissionRepo: any; finalizacaoRepo: any }) {
  const manager = {
    getRepository: jest.fn((entity: any) => {
      if (entity === Order) return repos.orderRepo;
      if (entity === NotaFiscal) return repos.notaRepo;
      if (entity === Commission) return repos.commissionRepo;
      if (entity === FaturamentoFinalizacao) return repos.finalizacaoRepo;
      throw new Error(`repo not mocked for ${String(entity)}`);
    }),
  };
  const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
  return new FaturamentoService(repos.notaRepo, repos.orderRepo, dataSource, repos.finalizacaoRepo);
}

describe('FaturamentoService', () => {
  describe('findPedidos', () => {
    function filaComPedidos(orders: Order[]) {
      const qb: any = {};
      for (const method of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy', 'skip', 'take']) {
        qb[method] = jest.fn().mockReturnValue(qb);
      }
      qb.getManyAndCount = jest.fn().mockResolvedValue([orders, orders.length]);
      const orderRepo = { createQueryBuilder: jest.fn(() => qb) };
      const somaQb: any = {};
      for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) {
        somaQb[method] = jest.fn().mockReturnValue(somaQb);
      }
      somaQb.getRawMany = jest.fn().mockResolvedValue([]);
      const notaRepo = { createQueryBuilder: jest.fn(() => somaQb) };
      return new FaturamentoService(notaRepo as any, orderRepo as any, {} as any, { find: jest.fn() } as any);
    }

    // Quem confere a nota precisa distinguir valor declarado de valor somado dos
    // itens: no pedido externo a divergência não significa a mesma coisa.
    it('projeta a origem e os dados do sistema de origem na fila', async () => {
      const service = filaComPedidos([
        buildOrder({ id: 1, numero_pedido: 10, origem: 'interno' } as Partial<Order>),
        buildOrder({
          id: 2,
          numero_pedido: 11,
          origem: 'externo',
          sistema_origem: 'Sistema do Fornecedor',
          numero_pedido_externo: 'PED-9911',
        } as Partial<Order>),
      ]);

      const { data } = await service.findPedidos(tenantId, { page: 1, limit: 20 });

      expect(data[0]).toMatchObject({ origem: 'interno', sistema_origem: null, numero_pedido_externo: null });
      expect(data[1]).toMatchObject({
        origem: 'externo',
        sistema_origem: 'Sistema do Fornecedor',
        numero_pedido_externo: 'PED-9911',
      });
    });

    it('sem busca não adiciona filtro de texto', async () => {
      const service = filaComPedidos([]);
      await service.findPedidos(tenantId, { page: 1, limit: 20 });
      const qb = (service as any).orderRepo.createQueryBuilder.mock.results[0].value;
      expect(qb.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('ILIKE'), expect.anything());
    });

    it('busca por nº do pedido (interno/externo), razão social e CNPJ de cliente e fornecedor', async () => {
      const service = filaComPedidos([]);
      await service.findPedidos(tenantId, { page: 1, limit: 20, search: '12.345.678/0001-90' });
      const qb = (service as any).orderRepo.createQueryBuilder.mock.results[0].value;
      const [where, params] = qb.andWhere.mock.calls.find(([sql]: [string]) => sql.includes('ILIKE'));
      for (const expr of [
        'CAST(o.numero_pedido AS TEXT)', 'o.numero_pedido_externo', 'cliente.razao_social',
        'fornecedor.razao_social', 'cliente.cnpj', 'fornecedor.cnpj',
      ]) {
        expect(where).toContain(`${expr} ILIKE :search`);
      }
      expect(where).toContain("regexp_replace(fornecedor.cnpj, '\\D', '', 'g') LIKE :searchDigits");
      expect(params).toEqual({ search: '%12.345.678/0001-90%', searchDigits: '%12345678000190%' });
    });

    it('trata pedido legado sem `origem` como interno', async () => {
      const service = filaComPedidos([buildOrder({ id: 1, origem: null } as unknown as Partial<Order>)]);

      const { data } = await service.findPedidos(tenantId, { page: 1, limit: 20 });

      expect(data[0].origem).toBe('interno');
    });
  });

  describe('registrarNota', () => {
    it('uma nota que cobre o total fecha o pedido (faturado) e cria comissão pendente', async () => {
      const order = buildOrder({ status: 'liberado' });
      const repos = buildRepos({ order, notaSumAfter: '100.00' });
      const service = buildService(repos);

      const nota = await service.registrarNota(pedidoUuid, {
        uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', numero_nota: '123', valor: 100,
      } as any, tenantId);

      expect(nota.id).toBe(5);
      expect(repos.commissionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        status: 'pendente', valor_comissao: '0.00', valor_faturado: '100.00', nota_fiscal_id: 5,
      }));
      expect(repos.orderRepo.update).toHaveBeenCalledWith(
        { id: order.id, tenant_id: tenantId },
        expect.objectContaining({ status: 'faturado' }),
      );
    });

    it('nota parcial deixa o pedido parcialmente_faturado', async () => {
      const order = buildOrder({ status: 'liberado' });
      const repos = buildRepos({ order, notaSumAfter: '40.00' });
      const service = buildService(repos);

      await service.registrarNota(pedidoUuid, {
        uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', numero_nota: '123', valor: 40,
      } as any, tenantId);

      expect(repos.orderRepo.update).toHaveBeenCalledWith(
        { id: order.id, tenant_id: tenantId },
        expect.objectContaining({ status: 'parcialmente_faturado' }),
      );
    });

    it('permite registrar nota em excesso mesmo com pedido já faturado, sem bloqueio', async () => {
      const order = buildOrder({ status: 'faturado' });
      const repos = buildRepos({ order, notaSumAfter: '150.00' });
      const service = buildService(repos);

      await expect(service.registrarNota(pedidoUuid, {
        uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', numero_nota: '124', valor: 50,
      } as any, tenantId)).resolves.toBeDefined();
    });

    it('bloqueia registro de nota em pedido em_aberto ou cancelado', async () => {
      const order = buildOrder({ status: 'em_aberto' });
      const repos = buildRepos({ order, notaSumAfter: '0.00' });
      const service = buildService(repos);

      await expect(service.registrarNota(pedidoUuid, {
        uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', numero_nota: '123', valor: 10,
      } as any, tenantId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('unicidade: rejeita número de nota duplicado no mesmo pedido', async () => {
      const order = buildOrder({ status: 'liberado' });
      const repos = buildRepos({ order, notaSumAfter: '100.00', existingNota: { id: 99, numero_nota: '123' } });
      const service = buildService(repos);

      await expect(service.registrarNota(pedidoUuid, {
        uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', numero_nota: '123', valor: 100,
      } as any, tenantId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 quando o pedido não existe no tenant', async () => {
      const repos = buildRepos({ order: buildOrder(), notaSumAfter: '0.00' });
      repos.orderRepo.findOne.mockResolvedValue(null);
      const service = buildService(repos);

      await expect(service.registrarNota(pedidoUuid, {
        uuid: 'dddddddd-dddd-dddd-dddd-dddddddddddd', numero_nota: '123', valor: 10,
      } as any, tenantId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('atualizarNota', () => {
    it('altera o valor e recalcula a comissão já faturada sem duplicar lançamento', async () => {
      const order = buildOrder({ status: 'faturado' });
      const nota = { id: 5, uuid: 'nota-1', tenant_id: tenantId, pedido_id: 1, numero_nota: '123', valor: '100.00', version: 1 };
      const commission = { id: 7, status: 'faturado', perc_comissao: '10.00' };
      const repos = buildRepos({ order, notaSumAfter: '120.00' });
      repos.notaRepo.findOne = jest.fn().mockResolvedValue(nota);
      repos.commissionRepo.findOne = jest.fn().mockResolvedValue(commission);
      const service = buildService(repos);

      const result = await service.atualizarNota('nota-1', { version: 1, valor: 120 } as any, tenantId);

      expect(result.valor).toBe('120.00');
      expect(repos.commissionRepo.update).toHaveBeenCalledTimes(1);
      expect(repos.commissionRepo.update).toHaveBeenCalledWith(
        { id: 7, tenant_id: tenantId },
        expect.objectContaining({ valor_faturado: '120.00', valor_comissao: '12.00' }),
      );
    });

    it('bloqueia alteração quando a comissão vinculada já está paga', async () => {
      const order = buildOrder({ status: 'faturado' });
      const nota = { id: 5, uuid: 'nota-1', tenant_id: tenantId, pedido_id: 1, numero_nota: '123', valor: '100.00', version: 1 };
      const commission = { id: 7, status: 'pago' };
      const repos = buildRepos({ order, notaSumAfter: '100.00' });
      repos.notaRepo.findOne = jest.fn().mockResolvedValue(nota);
      repos.commissionRepo.findOne = jest.fn().mockResolvedValue(commission);
      const service = buildService(repos);

      await expect(service.atualizarNota('nota-1', { version: 1, valor: 90 } as any, tenantId))
        .rejects.toBeInstanceOf(ConflictException);
      expect(repos.notaRepo.save).not.toHaveBeenCalled();
    });

    it('concorrência otimista: version divergente retorna 409', async () => {
      const order = buildOrder();
      const nota = { id: 5, uuid: 'nota-1', tenant_id: tenantId, pedido_id: 1, numero_nota: '123', valor: '100.00', version: 3 };
      const repos = buildRepos({ order, notaSumAfter: '100.00' });
      repos.notaRepo.findOne = jest.fn().mockResolvedValue(nota);
      const service = buildService(repos);

      await expect(service.atualizarNota('nota-1', { version: 1, valor: 90 } as any, tenantId))
        .rejects.toBeInstanceOf(ConcurrentModificationException);
    });
  });

  describe('excluirNota', () => {
    it('exclui a nota e a comissão vinculada, recalculando o pedido', async () => {
      const order = buildOrder({ status: 'faturado' });
      const nota = { id: 5, uuid: 'nota-1', tenant_id: tenantId, pedido_id: 1, numero_nota: '123', valor: '100.00', version: 1 };
      const commission = { id: 7, status: 'pendente' };
      const repos = buildRepos({ order, notaSumAfter: '0.00' });
      repos.notaRepo.findOne = jest.fn().mockResolvedValue(nota);
      repos.commissionRepo.findOne = jest.fn().mockResolvedValue(commission);
      const service = buildService(repos);

      await service.excluirNota('nota-1', 1, tenantId);

      expect(repos.notaRepo.softRemove).toHaveBeenCalledWith(nota);
      expect(repos.commissionRepo.softRemove).toHaveBeenCalledWith(commission);
      expect(repos.orderRepo.update).toHaveBeenCalledWith(
        { id: order.id, tenant_id: tenantId },
        expect.objectContaining({ status: 'liberado' }),
      );
    });

    it('bloqueia exclusão quando a comissão vinculada já está paga', async () => {
      const order = buildOrder({ status: 'faturado' });
      const nota = { id: 5, uuid: 'nota-1', tenant_id: tenantId, pedido_id: 1, numero_nota: '123', valor: '100.00', version: 1 };
      const commission = { id: 7, status: 'pago' };
      const repos = buildRepos({ order, notaSumAfter: '100.00' });
      repos.notaRepo.findOne = jest.fn().mockResolvedValue(nota);
      repos.commissionRepo.findOne = jest.fn().mockResolvedValue(commission);
      const service = buildService(repos);

      await expect(service.excluirNota('nota-1', 1, tenantId)).rejects.toBeInstanceOf(ConflictException);
      expect(repos.notaRepo.softRemove).not.toHaveBeenCalled();
    });
  });

  describe('finalização manual', () => {
    it('fecha saldo positivo recalculado no servidor e incrementa a versão do pedido', async () => {
      const order = buildOrder({ status: 'parcialmente_faturado', total_com_imposto: '42.85' });
      const repos = buildRepos({ order, notaSumAfter: '40.00' });
      const service = buildService(repos);

      const result = await service.finalizar(pedidoUuid, {
        uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 1, motivo: 'Diferença aceita',
      }, tenantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

      expect(result.saldo_encerrado).toBe('2.85');
      expect(repos.finalizacaoRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        pedido_id: 1, saldo_encerrado: '2.85', motivo: 'Diferença aceita',
      }));
      expect(repos.orderRepo.update).toHaveBeenCalledWith(
        { id: 1, tenant_id: tenantId },
        expect.objectContaining({ status: 'faturado' }),
      );
    });

    it('recusa status inválido, saldo não positivo e versão obsoleta', async () => {
      const invalidStatus = buildRepos({ order: buildOrder({ status: 'liberado' }), notaSumAfter: '0.00' });
      await expect(buildService(invalidStatus).finalizar(pedidoUuid, {
        uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 1, motivo: 'Motivo válido',
      }, tenantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toBeInstanceOf(ConflictException);

      const noBalance = buildRepos({ order: buildOrder({ status: 'parcialmente_faturado' }), notaSumAfter: '100.00' });
      await expect(buildService(noBalance).finalizar(pedidoUuid, {
        uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 1, motivo: 'Motivo válido',
      }, tenantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toBeInstanceOf(ConflictException);

      const stale = buildRepos({ order: buildOrder({ status: 'parcialmente_faturado', version: 2 }), notaSumAfter: '40.00' });
      await expect(buildService(stale).finalizar(pedidoUuid, {
        uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 1, motivo: 'Motivo válido',
      }, tenantId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toBeInstanceOf(ConcurrentModificationException);
    });

    it('reabre uma finalização ativa e recalcula o status pelas notas', async () => {
      const order = buildOrder({ status: 'faturado', version: 2 });
      const repos = buildRepos({ order, notaSumAfter: '40.00' });
      const active = { id: 9, uuid: 'fin-1', version: 3, tenant_id: tenantId, pedido_id: 1, reaberto_at: null };
      repos.finalizacaoRepo.findOne.mockResolvedValue(active);
      const service = buildService(repos);

      await service.reabrir(pedidoUuid, {
        version: 2, finalizacao_version: 3, motivo: 'Emitiremos outra nota',
      }, tenantId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

      expect(repos.finalizacaoRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        reaberto_por: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', reabertura_motivo: 'Emitiremos outra nota',
      }));
      expect(repos.orderRepo.update).toHaveBeenCalledWith(
        { id: 1, tenant_id: tenantId },
        expect.objectContaining({ status: 'parcialmente_faturado' }),
      );
    });

    it('bloqueia alteração de nota enquanto há fechamento ativo', async () => {
      const order = buildOrder({ status: 'faturado' });
      const repos = buildRepos({ order, notaSumAfter: '40.00' });
      repos.notaRepo.findOne.mockResolvedValue({ id: 5, uuid: 'nota-1', tenant_id: tenantId, pedido_id: 1, version: 1, valor: '40.00' });
      repos.finalizacaoRepo.findOne.mockResolvedValue({ id: 9, reaberto_at: null });

      await expect(buildService(repos).atualizarNota('nota-1', { version: 1, valor: 41 } as any, tenantId))
        .rejects.toBeInstanceOf(ConflictException);
      expect(repos.notaRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('Finalizar/ReabrirFaturamentoDto — motivo', () => {
  const pipeOptions = { whitelist: true, forbidNonWhitelisted: true };
  const base = { uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', version: 1 };

  it('aceita motivo até 1000 caracteres e recusa acima', async () => {
    expect(await validate(plainToInstance(FinalizarFaturamentoDto, { ...base, motivo: 'a'.repeat(1000) }), pipeOptions)).toEqual([]);

    const errors = await validate(plainToInstance(FinalizarFaturamentoDto, { ...base, motivo: 'a'.repeat(1001) }), pipeOptions);
    expect(errors.map((error) => error.property)).toEqual(['motivo']);

    const reabrir = await validate(
      plainToInstance(ReabrirFaturamentoDto, { version: 1, finalizacao_version: 1, motivo: 'a'.repeat(1001) }),
      pipeOptions,
    );
    expect(reabrir.map((error) => error.property)).toEqual(['motivo']);
  });
});
