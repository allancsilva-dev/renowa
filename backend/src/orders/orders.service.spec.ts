import { NotFoundException } from '@nestjs/common';
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
    it('retorna 404 ao tentar mudar status de pedido de outro vendedor', async () => {
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }) });
      const lookupBuilder = queryBuilder({ getRawOne: jest.fn().mockResolvedValue(undefined) });
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any);

      await expect(
        service.updateStatus(orderUuid, 'concluido', 1, vendedorA),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(updateBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('vendedor_id ='),
        { sub: vendedorA.sub, tenantId: vendedorA.tenantId },
      );
    });

    it('permite ao vendedor mudar status do próprio pedido, recarregando com relações', async () => {
      const saved = { uuid: orderUuid, status: 'concluido', version: 2 };
      const reloaded = { ...saved, itens: [] };
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1, raw: [saved] }) });
      const lookupBuilder = queryBuilder();
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any);
      jest.spyOn(service, 'findOne').mockResolvedValue(reloaded as any);

      await expect(
        service.updateStatus(orderUuid, 'concluido', 1, vendedorA),
      ).resolves.toBe(reloaded);
      expect(service.findOne).toHaveBeenCalledWith(orderUuid, vendedorA);
    });

    it('não restringe por vendedor para ADMIN', async () => {
      const saved = { uuid: orderUuid, status: 'concluido', version: 2 };
      const reloaded = { ...saved, itens: [] };
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1, raw: [saved] }) });
      const lookupBuilder = queryBuilder();
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any);
      jest.spyOn(service, 'findOne').mockResolvedValue(reloaded as any);

      await expect(service.updateStatus(orderUuid, 'concluido', 1, admin)).resolves.toBe(reloaded);
      expect(updateBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('vendedor_id'),
        expect.anything(),
      );
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
