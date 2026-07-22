import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto, CreateOrderItemDto, UpdateOrderDto } from './dto/create-order.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/jwt-payload.type';
import { optimisticSoftDelete, optimisticUpdate } from '../common/persistence/optimistic-concurrency';
import { calculateOrderItem, calculateOrderTotals } from './order-calculation';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';

type ReferenceTable = 'clientes' | 'usuarios' | 'fornecedores' | 'transportadoras' | 'produtos';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo: Repository<OrderItem>,
    private readonly dataSource: DataSource,
  ) {}

  private isVendorOnly(user: RequestUser): boolean {
    return user.roles.length === 1 && user.roles[0] === 'VENDEDOR';
  }

  private vendorOwnershipWhere(user: RequestUser): { sql: string; params: { sub: string; tenantId: string } } {
    return {
      sql: 'vendedor_id = (SELECT id FROM usuarios WHERE uuid = :sub AND tenant_id = :tenantId LIMIT 1)',
      params: { sub: user.sub, tenantId: user.tenantId },
    };
  }

  private async resolveUuid(
    manager: EntityManager,
    table: ReferenceTable,
    uuid: string | null | undefined,
    tenantId: string,
    required = false,
  ): Promise<number | null> {
    if (!uuid) {
      if (required) throw new BadRequestException(`Referência obrigatória ausente: ${table}.`);
      return null;
    }
    const rows = await manager.query(
      `SELECT id FROM ${table} WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [uuid, tenantId],
    ) as Array<{ id: number }>;
    if (!rows[0]) throw new BadRequestException(`Referência inválida ou fora do tenant: ${table}.`);
    return rows[0].id;
  }

  private async resolveHeader(manager: EntityManager, dto: CreateOrderDto, user: RequestUser) {
    const tenantId = user.tenantId;
    const vendedorUuid = this.isVendorOnly(user) ? user.sub : dto.vendedor_uuid;
    return {
      cliente_id: await this.resolveUuid(manager, 'clientes', dto.cliente_uuid, tenantId, true),
      vendedor_id: await this.resolveUuid(manager, 'usuarios', vendedorUuid, tenantId, this.isVendorOnly(user)),
      fornecedor_id: await this.resolveUuid(manager, 'fornecedores', dto.fornecedor_uuid, tenantId, true),
      transportadora_id: await this.resolveUuid(manager, 'transportadoras', dto.transportadora_uuid, tenantId),
    };
  }

  private async buildItem(
    manager: EntityManager,
    dto: CreateOrderItemDto,
    tenantId: string,
    orderId: number,
    supplierId: number,
  ): Promise<Partial<OrderItem>> {
    let produto_id: number | null = null;
    if (dto.produto_uuid) {
      const products = await manager.query(
        `SELECT id, fornecedor_id FROM produtos WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.produto_uuid, tenantId],
      ) as Array<{ id: number; fornecedor_id: number | null }>;
      if (!products[0] || products[0].fornecedor_id !== supplierId) {
        throw new BadRequestException('Produto inválido ou não vinculado ao fornecedor do pedido.');
      }
      produto_id = products[0].id;
    } else if (!dto.codigo_manual?.trim() && !dto.descricao_manual?.trim()) {
      throw new BadRequestException('Informe um produto ou código/descrição manual para cada item.');
    }

    const calculated = calculateOrderItem(dto);
    return {
      uuid: dto.uuid,
      tenant_id: tenantId,
      pedido_id: orderId,
      produto_id,
      codigo_manual: dto.codigo_manual?.trim() || null,
      descricao_manual: dto.descricao_manual?.trim() || null,
      qtd_caixas: calculated.qtd_caixas,
      qtd_unitaria: calculated.qtd_unitaria,
      qtd_total: calculated.qtd_total,
      preco_unitario: calculated.preco_unitario,
      desconto_perc: calculated.desconto_perc,
      valor_com_desconto: calculated.valor_com_desconto,
      ipi_perc: dto.ipi_perc === undefined ? null : calculated.ipi_perc,
      valor_com_imposto: calculated.valor_com_imposto,
      total_item: calculated.total_item_sem_imposto,
      total_com_imposto: calculated.total_item_com_imposto,
    };
  }

  private totalsFromItems(items: Array<Partial<OrderItem>>) {
    return calculateOrderTotals(items.map((item) => ({
      qtd_caixas: item.qtd_caixas!,
      qtd_unitaria: item.qtd_unitaria!,
      qtd_total: item.qtd_total!,
      preco_unitario: item.preco_unitario!,
      desconto_perc: item.desconto_perc!,
      valor_com_desconto: item.valor_com_desconto!,
      ipi_perc: item.ipi_perc!,
      valor_com_imposto: item.valor_com_imposto!,
      total_item_sem_imposto: item.total_item!,
      total_item_com_imposto: item.total_com_imposto!,
    })));
  }

  async create(dto: CreateOrderDto, user: RequestUser): Promise<Order> {
    const uuid = await this.dataSource.transaction(async (manager) => {
      const refs = await this.resolveHeader(manager, dto, user);
      const sequence = await manager.query(`SELECT nextval('pedidos_numero_seq')::int AS numero`) as Array<{ numero: number }>;
      const order = manager.create(Order, {
        uuid: dto.uuid,
        tenant_id: user.tenantId,
        numero_pedido: sequence[0].numero,
        ...refs,
        data: dto.data ?? null,
        // Todo pedido nasce 'em_aberto'. Liberação é endpoint dedicado.
        status: 'em_aberto',
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
        tipo_faturamento: dto.tipo_faturamento ?? null,
      });
      const saved = await manager.save(order);
      const items = await Promise.all(dto.itens.map((item) =>
        this.buildItem(manager, item, user.tenantId, saved.id, refs.fornecedor_id!),
      ));
      const totals = this.totalsFromItems(items);
      await manager.save(items.map((item) => manager.create(OrderItem, item)));
      saved.total_sem_imposto = totals.total_sem_imposto;
      saved.total_com_imposto = totals.total_com_imposto;
      await manager.save(saved);
      return saved.uuid;
    });
    return this.findOne(uuid, user);
  }

  async update(uuid: string, dto: UpdateOrderDto, user: RequestUser): Promise<Order> {
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const itemRepo = manager.getRepository(OrderItem);
      const order = await orderRepo.findOne({
        where: { uuid, tenant_id: user.tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
      if (order.version !== dto.version) {
        throw new ConcurrentModificationException('order', uuid, dto.version, order.version);
      }
      if (this.isVendorOnly(user)) {
        const ownId = await this.resolveUuid(manager, 'usuarios', user.sub, user.tenantId, true);
        if (order.vendedor_id !== ownId) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
      }
      if (order.status !== 'em_aberto') {
        throw new ConflictException(`Pedido ${uuid} não pode ser editado pois não está em aberto.`);
      }

      const refs = await this.resolveHeader(manager, dto, user);
      const existingItems = await itemRepo.find({ withDeleted: true, where: { pedido_id: order.id, tenant_id: user.tenantId } });
      const byUuid = new Map(existingItems.map((item) => [item.uuid, item]));
      const requested = new Set(dto.itens.map((item) => item.uuid));
      const calculatedItems: Array<Partial<OrderItem>> = [];

      for (const itemDto of dto.itens) {
        const collisions = await manager.query(
          'SELECT tenant_id, pedido_id FROM itens_pedido WHERE uuid = $1 LIMIT 1',
          [itemDto.uuid],
        ) as Array<{ tenant_id: string; pedido_id: number }>;
        if (collisions[0] && (collisions[0].tenant_id !== user.tenantId || collisions[0].pedido_id !== order.id)) {
          throw new BadRequestException('UUID de item já pertence a outro pedido ou tenant.');
        }
        const values = await this.buildItem(manager, itemDto, user.tenantId, order.id, refs.fornecedor_id!);
        calculatedItems.push(values);
        const existing = byUuid.get(itemDto.uuid);
        if (existing) {
          Object.assign(existing, values, { deleted_at: null });
          await itemRepo.save(existing);
        } else {
          await itemRepo.save(itemRepo.create(values));
        }
      }

      const omitted = existingItems.filter((item) => !item.deleted_at && !requested.has(item.uuid));
      if (omitted.length) await itemRepo.softRemove(omitted);

      const totals = this.totalsFromItems(calculatedItems);
      // `status` não é tocado no update: a guarda acima só deixa editar pedido
      // 'em_aberto', e transição de status tem endpoint próprio.
      Object.assign(order, refs, {
        data: dto.data ?? null,
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
        tipo_faturamento: dto.tipo_faturamento ?? null,
        total_sem_imposto: totals.total_sem_imposto,
        total_com_imposto: totals.total_com_imposto,
      });
      await orderRepo.save(order);
    });
    return this.findOne(uuid, user);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    user: RequestUser,
    status?: string,
    search?: string,
  ): Promise<PaginatedResponse<Order>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (this.isVendorOnly(user)) {
      qb.andWhere(`o.${this.vendorOwnershipWhere(user).sql}`, this.vendorOwnershipWhere(user).params);
    }
    if (status) qb.andWhere('o.status = :status', { status });
    if (search) {
      qb.andWhere('(CAST(o.numero_pedido AS TEXT) ILIKE :search OR c.razao_social ILIKE :search OR c.cnpj ILIKE :search)', { search: `%${search}%` });
    }
    const [data, total] = await qb.orderBy('o.created_at', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, user: RequestUser): Promise<Order> {
    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'cliente')
      .leftJoinAndSelect('cliente.transportadora', 'clienteTransportadora')
      .leftJoinAndSelect('o.transportadora', 'transportadora')
      .leftJoinAndSelect('o.fornecedor', 'fornecedor')
      .leftJoinAndSelect('o.vendedor', 'vendedor')
      .leftJoinAndSelect('o.itens', 'itens', 'itens.deleted_at IS NULL')
      .leftJoinAndSelect('itens.produto', 'produto')
      .where('o.uuid = :uuid', { uuid })
      .andWhere('o.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (this.isVendorOnly(user)) {
      const { sql, params } = this.vendorOwnershipWhere(user);
      qb.andWhere(`o.${sql}`, params);
    }
    const order = await qb.getOne();
    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
    return order;
  }

  /**
   * Liberação vira endpoint dedicado (`liberar`); `parcialmente_faturado`/
   * `faturado` derivam exclusivamente do faturamento (nunca setados manualmente).
   * Único valor aceito aqui é 'cancelado' — e só quando não há notas fiscais
   * ativas vinculadas ao pedido.
   */
  async updateStatus(uuid: string, status: string, version: number, user: RequestUser): Promise<Order> {
    if (status !== 'cancelado') {
      throw new BadRequestException(
        "Transição de status inválida. Use PATCH /pedidos/:uuid/liberar para liberar o pedido; este endpoint só cancela.",
      );
    }

    const order = await this.findOne(uuid, user);

    if (await this.countNotasAtivas(user.tenantId, order.id) > 0) {
      throw new ConflictException('Pedido possui notas fiscais ativas e não pode ser cancelado.');
    }

    await optimisticUpdate({ repository: this.orderRepo, uuid, tenantId: user.tenantId,
      expectedVersion: version, resource: 'order', notFoundMessage: `Pedido ${uuid} não encontrado.`, patch: { status },
      extraWhere: this.isVendorOnly(user) ? this.vendorOwnershipWhere(user) : undefined });
    return this.findOne(uuid, user);
  }

  /** Libera o pedido para faturamento — só a partir de 'em_aberto'. */
  async liberar(uuid: string, version: number, user: RequestUser): Promise<Order> {
    const order = await this.findOne(uuid, user);
    if (order.status !== 'em_aberto') {
      throw new ConflictException('Pedido só pode ser liberado quando está em aberto.');
    }

    await optimisticUpdate({ repository: this.orderRepo, uuid, tenantId: user.tenantId,
      expectedVersion: version, resource: 'order', notFoundMessage: `Pedido ${uuid} não encontrado.`, patch: { status: 'liberado' },
      extraWhere: this.isVendorOnly(user) ? this.vendorOwnershipWhere(user) : undefined });
    return this.findOne(uuid, user);
  }

  /**
   * Notas fiscais ativas travam tanto cancelamento quanto exclusão: sem essa
   * guarda, o soft delete do pedido deixa nota e comissão vivas (`deleted_at
   * IS NULL`) somando no caixa, e ainda torna a nota impossível de corrigir —
   * `FaturamentoService` não acha mais o pedido dono dela.
   */
  private async countNotasAtivas(tenantId: string, orderId: number): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM notas_fiscais WHERE tenant_id = $1 AND pedido_id = $2 AND deleted_at IS NULL`,
      [tenantId, orderId],
    ) as Array<{ total: number }>;
    return Number(rows[0]?.total ?? 0);
  }

  async remove(uuid: string, version: number, user: RequestUser): Promise<void> {
    const order = await this.findOne(uuid, user);
    if (await this.countNotasAtivas(user.tenantId, order.id) > 0) {
      throw new ConflictException(
        'Pedido possui notas fiscais ativas e não pode ser excluído. Exclua as notas fiscais primeiro.',
      );
    }

    await optimisticSoftDelete({ repository: this.orderRepo, uuid, tenantId: user.tenantId,
      expectedVersion: version, resource: 'order', notFoundMessage: `Pedido ${uuid} não encontrado.`,
      extraWhere: this.isVendorOnly(user) ? this.vendorOwnershipWhere(user) : undefined });
  }
}
