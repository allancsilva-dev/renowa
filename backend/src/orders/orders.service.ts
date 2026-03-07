import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { ClientsService } from '../clients/clients.service';
import { ProductsService } from '../products/products.service';
import { TransportService } from '../transport/transport.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    private readonly dataSource: DataSource,
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly transportService: TransportService,
  ) {}

  async create(dto: CreateOrderDto, tenantId: string): Promise<Order> {
    return this.dataSource.transaction(async (em) => {
      // CHANGELOG #3: UUID→ID resolution
      const cliente = await this.clientsService.findOne(dto.cliente_uuid, tenantId);

      let transportadora_id: number | null = null;
      if (dto.transportadora_uuid) {
        const t = await this.transportService.findOne(dto.transportadora_uuid, tenantId);
        transportadora_id = t.id;
      }

      const order = em.create(Order, {
        tenant_id: tenantId,
        cliente_id: cliente.id,
        transportadora_id,
        status: dto.status ?? OrderStatus.RASCUNHO,
        data_pedido: dto.data_pedido,
        data_entrega_prevista: dto.data_entrega_prevista ?? null,
        observacoes: dto.observacoes ?? null,
        valor_total: 0,
        desconto_total: 0,
      });

      const savedOrder = await em.save(order);

      let valorTotal = 0;
      let descontoTotal = 0;

      const itens: OrderItem[] = [];
      for (const itemDto of dto.itens) {
        // CHANGELOG #3: UUID→ID resolution para produtos
        const produto = await this.productsService.findOne(itemDto.produto_uuid, tenantId);

        const desconto = itemDto.desconto_percentual ?? 0;
        const valorBruto = itemDto.quantidade * itemDto.preco_unitario;
        const valorDesconto = valorBruto * (desconto / 100);
        const valorItem = valorBruto - valorDesconto;

        valorTotal += valorItem;
        descontoTotal += valorDesconto;

        const item = em.create(OrderItem, {
          tenant_id: tenantId,
          pedido_id: savedOrder.id,
          produto_id: produto.id,
          quantidade: itemDto.quantidade,
          preco_unitario: itemDto.preco_unitario,
          desconto_percentual: desconto,
          valor_total: valorItem,
          observacoes: itemDto.observacoes ?? null,
        });

        itens.push(item);
      }

      await em.save(itens);

      await em.update(Order, savedOrder.id, {
        valor_total: valorTotal,
        desconto_total: descontoTotal,
      });

      return { ...savedOrder, valor_total: valorTotal, desconto_total: descontoTotal, itens };
    });
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    status?: OrderStatus,
  ): Promise<PaginatedResponse<Order>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'c')
      .leftJoinAndSelect('o.transportadora', 't')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.deleted_at IS NULL');

    if (status) qb.andWhere('o.status = :status', { status });

    const [data, total] = await qb
      .orderBy('o.numero_pedido', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['cliente', 'transportadora', 'itens', 'itens.produto'],
    });

    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado`);
    return order;
  }

  async updateStatus(uuid: string, status: OrderStatus, tenantId: string): Promise<Order> {
    const order = await this.findOne(uuid, tenantId);
    order.status = status;
    return this.orderRepo.save(order);
  }

  async remove(uuid: string, tenantId: string): Promise<void> {
    const order = await this.findOne(uuid, tenantId);
    await this.orderRepo.softDelete(order.id);
  }
}
