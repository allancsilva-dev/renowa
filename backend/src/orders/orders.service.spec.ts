import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { RequestUser } from '../common/types/jwt-payload.type';

function queryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'leftJoinAndSelect', 'where', 'andWhere', 'update', 'set', 'returning']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  return Object.assign(builder, overrides);
}

function repoForWrite(updateBuilder: object, lookupBuilder: object) {
  return {
    createQueryBuilder: jest.fn((alias?: string) => (alias ? lookupBuilder : updateBuilder)),
  } as any;
}

const vendedorA: RequestUser = {
  sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'tenant-a',
  tenantSubdomain: 'tenant-a',
  roles: ['VENDEDOR'],
  plan: 'pro',
  tokenVersion: 1,
  jti: 'jti-a',
};

const admin: RequestUser = { ...vendedorA, roles: ['ADMIN'] };

const orderUuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('OrdersService — IDOR entre vendedores do mesmo tenant', () => {
  describe('findOne', () => {
    it('retorna o pedido quando pertence ao vendedor autenticado', async () => {
      const order = { id: 1, uuid: orderUuid };
      const findQb = queryBuilder({ getOne: jest.fn().mockResolvedValue(order) });
      const orderRepo = { createQueryBuilder: jest.fn().mockReturnValue(findQb) } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any);

      await expect(service.findOne(orderUuid, vendedorA)).resolves.toBe(order);
      expect(findQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('o.vendedor_id ='),
        { sub: vendedorA.sub, tenantId: vendedorA.tenantId },
      );
    });

    it('retorna 404 (não 403) quando o pedido pertence a outro vendedor do mesmo tenant', async () => {
      const findQb = queryBuilder({ getOne: jest.fn().mockResolvedValue(undefined) });
      const orderRepo = { createQueryBuilder: jest.fn().mockReturnValue(findQb) } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any);

      await expect(service.findOne(orderUuid, vendedorA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('não restringe por vendedor para roles não exclusivamente VENDEDOR', async () => {
      const order = { id: 1, uuid: orderUuid };
      const findQb = queryBuilder({ getOne: jest.fn().mockResolvedValue(order) });
      const orderRepo = { createQueryBuilder: jest.fn().mockReturnValue(findQb) } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any);

      await expect(service.findOne(orderUuid, admin)).resolves.toBe(order);
      expect(findQb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('vendedor_id'),
        expect.anything(),
      );
    });
  });

  describe('updateStatus', () => {
    it('rejeita qualquer status diferente de cancelado', async () => {
      const orderRepo = { createQueryBuilder: jest.fn() } as any;
      const dataSource = { query: jest.fn() } as any;
      const service = new OrdersService(orderRepo, {} as any, dataSource);

      await expect(
        service.updateStatus(orderUuid, 'liberado', 1, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('bloqueia cancelamento quando há notas fiscais ativas', async () => {
      const orderRepo = {} as any;
      const dataSource = { query: jest.fn().mockResolvedValue([{ total: 1 }]) } as any;
      const service = new OrdersService(orderRepo, {} as any, dataSource);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid } as any);

      await expect(
        service.updateStatus(orderUuid, 'cancelado', 1, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('retorna 404 ao tentar cancelar pedido de outro vendedor', async () => {
      const orderRepo = {} as any;
      const dataSource = { query: jest.fn() } as any;
      const service = new OrdersService(orderRepo, {} as any, dataSource);
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(
        service.updateStatus(orderUuid, 'cancelado', 1, vendedorA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('cancela quando não há notas fiscais ativas', async () => {
      const saved = { uuid: orderUuid, status: 'cancelado', version: 2 };
      const reloaded = { ...saved, itens: [] };
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1, raw: [saved] }) });
      const lookupBuilder = queryBuilder();
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const dataSource = { query: jest.fn().mockResolvedValue([{ total: 0 }]) } as any;
      const service = new OrdersService(orderRepo, {} as any, dataSource);
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 1, uuid: orderUuid, status: 'em_aberto' } as any)
        .mockResolvedValueOnce(reloaded as any);

      await expect(
        service.updateStatus(orderUuid, 'cancelado', 1, admin),
      ).resolves.toBe(reloaded);
    });
  });

  describe('liberar', () => {
    it('libera pedido em_aberto', async () => {
      const saved = { uuid: orderUuid, status: 'liberado', version: 2 };
      const reloaded = { ...saved, itens: [] };
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1, raw: [saved] }) });
      const lookupBuilder = queryBuilder();
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any);
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 1, uuid: orderUuid, status: 'em_aberto' } as any)
        .mockResolvedValueOnce(reloaded as any);

      await expect(service.liberar(orderUuid, 1, admin)).resolves.toBe(reloaded);
    });

    it('bloqueia liberação de pedido que não está em_aberto (409)', async () => {
      const orderRepo = {} as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid, status: 'liberado' } as any);

      await expect(service.liberar(orderUuid, 1, admin)).rejects.toBeInstanceOf(ConflictException);
    });

    it('retorna 404 ao tentar liberar pedido de outro vendedor', async () => {
      const orderRepo = {} as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any);
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.liberar(orderUuid, 1, vendedorA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update — bloqueio de edição pós-liberação', () => {
    it('bloqueia PUT quando o pedido não está em_aberto', async () => {
      const order = { id: 1, uuid: orderUuid, tenant_id: 'tenant-a', version: 1, status: 'liberado', vendedor_id: null };
      const orderRepo = {
        findOne: jest.fn().mockResolvedValue(order),
        save: jest.fn(async (value: any) => value),
      };
      const manager = {
        getRepository: jest.fn().mockReturnValue(orderRepo),
        query: jest.fn().mockResolvedValue([{ id: 10 }]),
      };
      const dataSource = { transaction: jest.fn((cb: any) => cb(manager)) } as any;
      const service = new OrdersService({} as any, {} as any, dataSource);

      await expect(
        service.update(orderUuid, { version: 1, itens: [] } as any, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('retorna 404 ao tentar apagar pedido de outro vendedor', async () => {
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 0 }) });
      const lookupBuilder = queryBuilder({ getRawOne: jest.fn().mockResolvedValue(undefined) });
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any);

      await expect(service.remove(orderUuid, 1, vendedorA)).rejects.toBeInstanceOf(NotFoundException);

      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('vendedor_id ='),
        { sub: vendedorA.sub, tenantId: vendedorA.tenantId },
      );
    });

    it('permite ao vendedor apagar o próprio pedido', async () => {
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1 }) });
      const lookupBuilder = queryBuilder();
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any);

      await expect(service.remove(orderUuid, 1, vendedorA)).resolves.toBeUndefined();
    });
  });
});
