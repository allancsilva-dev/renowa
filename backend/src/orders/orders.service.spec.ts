// Necessário antes dos DTOs: sem isto os decorators de class-validator/
// class-transformer não registram metadata e a validação vira ruído.
import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dto/create-order.dto';
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
      const service = new OrdersService(orderRepo, {} as any, {} as any, {} as any);

      await expect(service.findOne(orderUuid, vendedorA)).resolves.toBe(order);
      expect(findQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('o.vendedor_id ='),
        { sub: vendedorA.sub, tenantId: vendedorA.tenantId },
      );
    });

    it('retorna 404 (não 403) quando o pedido pertence a outro vendedor do mesmo tenant', async () => {
      const findQb = queryBuilder({ getOne: jest.fn().mockResolvedValue(undefined) });
      const orderRepo = { createQueryBuilder: jest.fn().mockReturnValue(findQb) } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any, {} as any);

      await expect(service.findOne(orderUuid, vendedorA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('não restringe por vendedor para roles não exclusivamente VENDEDOR', async () => {
      const order = { id: 1, uuid: orderUuid };
      const findQb = queryBuilder({ getOne: jest.fn().mockResolvedValue(order) });
      const orderRepo = { createQueryBuilder: jest.fn().mockReturnValue(findQb) } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any, {} as any);

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
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSource);

      await expect(
        service.updateStatus(orderUuid, 'liberado', 1, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('bloqueia cancelamento quando há notas fiscais ativas', async () => {
      const orderRepo = {} as any;
      const dataSource = { query: jest.fn().mockResolvedValue([{ total: 1 }]) } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSource);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid } as any);

      await expect(
        service.updateStatus(orderUuid, 'cancelado', 1, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('retorna 404 ao tentar cancelar pedido de outro vendedor', async () => {
      const orderRepo = {} as any;
      const dataSource = { query: jest.fn() } as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSource);
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
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSource);
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
      const service = new OrdersService(orderRepo, {} as any, {} as any, {} as any);
      jest.spyOn(service, 'findOne')
        .mockResolvedValueOnce({ id: 1, uuid: orderUuid, status: 'em_aberto' } as any)
        .mockResolvedValueOnce(reloaded as any);

      await expect(service.liberar(orderUuid, 1, admin)).resolves.toBe(reloaded);
    });

    it('bloqueia liberação de pedido que não está em_aberto (409)', async () => {
      const orderRepo = {} as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any, {} as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid, status: 'liberado' } as any);

      await expect(service.liberar(orderUuid, 1, admin)).rejects.toBeInstanceOf(ConflictException);
    });

    it('retorna 404 ao tentar liberar pedido de outro vendedor', async () => {
      const orderRepo = {} as any;
      const service = new OrdersService(orderRepo, {} as any, {} as any, {} as any);
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
      const service = new OrdersService({} as any, {} as any, {} as any, dataSource);

      await expect(
        service.update(orderUuid, { version: 1, itens: [] } as any, admin),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    /** `remove` passou a checar notas fiscais antes de apagar — precisa de dataSource. */
    function dataSourceWithNotas(total: number) {
      return { query: jest.fn().mockResolvedValue([{ total }]) } as any;
    }

    it('retorna 404 ao tentar apagar pedido de outro vendedor', async () => {
      const service = new OrdersService({} as any, {} as any, {} as any, dataSourceWithNotas(0));
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.remove(orderUuid, 1, vendedorA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mantém o escopo do vendedor no próprio soft delete', async () => {
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 0 }) });
      const lookupBuilder = queryBuilder({ getRawOne: jest.fn().mockResolvedValue(undefined) });
      const orderRepo = repoForWrite(updateBuilder, lookupBuilder);
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSourceWithNotas(0));
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid } as any);

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
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSourceWithNotas(0));
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid } as any);

      await expect(service.remove(orderUuid, 1, vendedorA)).resolves.toBeUndefined();
    });

    it('bloqueia exclusão de pedido com nota fiscal ativa (nota/comissão órfã no caixa)', async () => {
      const updateBuilder = queryBuilder({ execute: jest.fn().mockResolvedValue({ affected: 1 }) });
      const orderRepo = repoForWrite(updateBuilder, queryBuilder());
      const service = new OrdersService(orderRepo, {} as any, {} as any, dataSourceWithNotas(1));
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1, uuid: orderUuid } as any);

      await expect(service.remove(orderUuid, 1, admin)).rejects.toBeInstanceOf(ConflictException);
      expect(updateBuilder.execute).not.toHaveBeenCalled();
    });
  });

  describe('findOneDetalhe', () => {
    function serviceComNotas(notas: any[]) {
      const notaRepo = { find: jest.fn().mockResolvedValue(notas) } as any;
      const service = new OrdersService({} as any, {} as any, notaRepo, {} as any);
      return { service, notaRepo };
    }

    const pedido = { id: 7, uuid: orderUuid, total_com_imposto: '1000.00', total_sem_imposto: '900.00' };

    it('anexa as notas e calcula total faturado e divergência', async () => {
      const notas = [{ uuid: 'n1', valor: '400.00' }, { uuid: 'n2', valor: '250.50' }];
      const { service, notaRepo } = serviceComNotas(notas);
      jest.spyOn(service, 'findOne').mockResolvedValue(pedido as any);

      const detalhe = await service.findOneDetalhe(orderUuid, admin);

      expect(detalhe.notas).toBe(notas);
      expect(detalhe.total_faturado).toBe('650.50');
      expect(detalhe.divergencia).toBe('349.50');
      // Escopo obrigatório: tenant + pedido + notas não apagadas.
      expect(notaRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ pedido_id: 7, tenant_id: admin.tenantId }),
        }),
      );
    });

    it('devolve totais zerados quando o pedido não tem nota', async () => {
      const { service } = serviceComNotas([]);
      jest.spyOn(service, 'findOne').mockResolvedValue(pedido as any);

      const detalhe = await service.findOneDetalhe(orderUuid, admin);

      expect(detalhe.notas).toEqual([]);
      expect(detalhe.total_faturado).toBe('0.00');
      expect(detalhe.divergencia).toBe('1000.00');
    });

    it('usa total_sem_imposto quando não há total_com_imposto', async () => {
      const { service } = serviceComNotas([{ uuid: 'n1', valor: '100.00' }]);
      jest.spyOn(service, 'findOne').mockResolvedValue({ ...pedido, total_com_imposto: null } as any);

      await expect(service.findOneDetalhe(orderUuid, admin)).resolves.toMatchObject({
        total_faturado: '100.00',
        divergencia: '800.00',
      });
    });

    it('propaga o 404 do findOne — vendedor sem ownership não vê as notas', async () => {
      const { service, notaRepo } = serviceComNotas([{ uuid: 'n1', valor: '100.00' }]);
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(service.findOneDetalhe(orderUuid, vendedorA)).rejects.toBeInstanceOf(NotFoundException);
      expect(notaRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('status não é aceito no corpo de create/update', () => {
    // Guarda de regressão: enquanto `status` era @IsOptional() @IsString() no
    // DTO, um vendedor sem `pedidos.liberar` mandava {"status":"liberado"} no
    // POST/PUT e contornava o endpoint dedicado — e podia ir direto a
    // 'faturado' sem nenhuma nota fiscal. Valida contra o mesmo par de opções
    // do ValidationPipe global (`main.ts`).
    const pipeOptions = { whitelist: true, forbidNonWhitelisted: true };

    const validBody = {
      // v4 de verdade: `orderUuid` do resto do spec não passa em @IsUUID('4').
      uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      cliente_uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      fornecedor_uuid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      itens: [{
        uuid: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: 10,
      }],
    };

    it('aceita o corpo válido sem `status`', async () => {
      const errors = await validate(plainToInstance(CreateOrderDto, validBody), pipeOptions);
      expect(errors).toEqual([]);
    });

    it('rejeita `status` no corpo do create', async () => {
      const dto = plainToInstance(CreateOrderDto, { ...validBody, status: 'liberado' });
      const errors = await validate(dto, pipeOptions);

      expect(errors.map((error) => error.property)).toContain('status');
    });

    it('rejeita `status` no corpo do update', async () => {
      const dto = plainToInstance(UpdateOrderDto, { ...validBody, version: 1, status: 'faturado' });
      const errors = await validate(dto, pipeOptions);

      expect(errors.map((error) => error.property)).toContain('status');
    });
  });
});
