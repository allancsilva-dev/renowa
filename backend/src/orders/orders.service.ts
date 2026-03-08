import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/jwt-payload.type';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    private readonly dataSource: DataSource,
  ) {}

  /** UUID→ID resolution — mobile envia uuid, servidor resolve para id */
  private async resolveUuid(table: string, uuid: string, tenantId: string): Promise<number | null> {
    if (!uuid) return null;
    const rows = await this.dataSource.query(
      `SELECT id FROM ${table} WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [uuid, tenantId],
    );
    return (rows[0]?.id as number) ?? null;
  }

  async create(dto: CreateOrderDto, user: RequestUser): Promise<Order> {
    return this.dataSource.transaction(async (em) => {
      const tenantId = user.tenantId;

      const cliente_id = dto.cliente_uuid
        ? await this.resolveUuid('clientes', dto.cliente_uuid, tenantId)
        : null;

      const vendedor_id = dto.vendedor_uuid
        ? await this.resolveUuid('usuarios', dto.vendedor_uuid, tenantId)
        : null;

      const fornecedor_id = dto.fornecedor_uuid
        ? await this.resolveUuid('fornecedores', dto.fornecedor_uuid, tenantId)
        : null;

      const transportadora_id = dto.transportadora_uuid
        ? await this.resolveUuid('transportadoras', dto.transportadora_uuid, tenantId)
        : null;

      const order = em.create(Order, {
        uuid: dto.uuid,
        tenant_id: tenantId,
        cliente_id,
        vendedor_id,
        fornecedor_id,
        transportadora_id,
        data: dto.data ?? null,
        status: dto.status ?? 'em_aberto',
        total_sem_imposto: dto.total_sem_imposto ?? null,
        total_com_imposto: dto.total_com_imposto ?? null,
        pgt: dto.pgt ?? null,
        prazo: dto.prazo ?? null,
        local_entrega: dto.local_entrega ?? null,
        observacao: dto.observacao ?? null,
      });

      const savedOrder = await em.save(order);

      if (dto.itens && dto.itens.length > 0) {
        const itens: OrderItem[] = [];

        for (const itemDto of dto.itens) {
          const produto_id = itemDto.produto_uuid
            ? await this.resolveUuid('produtos', itemDto.produto_uuid, tenantId)
            : null;

          const item = em.create(OrderItem, {
            uuid: itemDto.uuid,
            tenant_id: tenantId,
            pedido_id: savedOrder.id,
            produto_id,
            codigo_manual: itemDto.codigo_manual ?? null,
            descricao_manual: itemDto.descricao_manual ?? null,
            qtd_caixas: itemDto.qtd_caixas ?? null,
            qtd_unitaria: itemDto.qtd_unitaria ?? null,
            preco_unitario: itemDto.preco_unitario ?? null,
            desconto_perc: itemDto.desconto_perc ?? null,
            total_item: itemDto.total_item ?? null,
          });

          itens.push(item);
        }

        await em.save(itens);
      }

      return savedOrder;
    });
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    user: RequestUser,
    status?: string,
    search?: string,
  ): Promise<PaginatedResponse<Order>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.deleted_at IS NULL');

    // VENDEDOR com somente essa role vê apenas os próprios pedidos
    if (user.roles.length === 1 && user.roles[0] === 'VENDEDOR') {
      qb.andWhere(
        `o.vendedor_id = (SELECT id FROM usuarios WHERE uuid = :sub AND tenant_id = :tenantId LIMIT 1)`,
        { sub: user.sub, tenantId },
      );
    }

    if (status) qb.andWhere('o.status = :status', { status });

    if (search) {
      qb.andWhere(
        'CAST(o.numero_pedido AS TEXT) ILIKE :search',
        { search: `%${search}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('o.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['cliente', 'transportadora', 'fornecedor', 'itens', 'itens.produto'],
    });

    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
    return order;
  }

  async updateStatus(uuid: string, status: string, tenantId: string): Promise<Order> {
    const order = await this.findOne(uuid, tenantId);
    order.status = status;
    return this.orderRepo.save(order);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const order = await this.findOne(uuid, tenantId);
    await this.orderRepo.softDelete(order.id);
  }
}
