import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FinanceMovement } from './entities/finance-movement.entity';
import { Commission } from './entities/commission.entity';
import { Inadimplencia } from './entities/inadimplencia.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { CreateComissaoDto } from './dto/create-comissao.dto';
import { CreateInadimplenciaDto } from './dto/create-inadimplencia.dto';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceMovement)
    private readonly movimentoRepo: Repository<FinanceMovement>,
    @InjectRepository(Commission)
    private readonly comissaoRepo: Repository<Commission>,
    @InjectRepository(Inadimplencia)
    private readonly inadimplenciaRepo: Repository<Inadimplencia>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Movimentações ─────────────────────────────────────────

  async createMovimento(dto: CreateMovementDto, tenantId: string): Promise<FinanceMovement> {
    const m = this.movimentoRepo.create({
      uuid: dto.uuid,
      tipo: dto.tipo,
      valor: dto.valor,
      data: dto.data ?? null,
      descricao: dto.descricao ?? null,
      tenant_id: tenantId,
    });
    return this.movimentoRepo.save(m);
  }

  async findAllMovimentos(
    tenantId: string,
    pagination: PaginationDto,
    tipo?: string,
  ): Promise<PaginatedResponse<FinanceMovement>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.movimentoRepo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL');

    if (tipo) qb.andWhere('m.tipo = :tipo', { tipo });

    const [data, total] = await qb
      .orderBy('m.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOneMovimento(uuid: string, tenantId: string): Promise<FinanceMovement> {
    const m = await this.movimentoRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!m) throw new NotFoundException(`Movimentação ${uuid} não encontrada.`);
    return m;
  }

  async removeMovimento(uuid: string, tenantId: string): Promise<void> {
    const m = await this.findOneMovimento(uuid, tenantId);
    await this.movimentoRepo.softDelete(m.id);
  }

  // ── Comissões ─────────────────────────────────────────────

  async createComissao(dto: CreateComissaoDto, tenantId: string): Promise<Commission> {
    let pedido_id: number | null = null;
    if (dto.pedido_uuid) {
      const rows = await this.dataSource.query(
        `SELECT id FROM pedidos WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.pedido_uuid, tenantId],
      );
      pedido_id = (rows[0]?.id as number) ?? null;
    }

    const c = this.comissaoRepo.create({
      uuid: dto.uuid,
      tenant_id: tenantId,
      pedido_id,
      nfe: dto.nfe ?? null,
      valor_faturado: dto.valor_faturado ?? null,
      perc_comissao: dto.perc_comissao ?? null,
      valor_comissao: dto.valor_comissao,  // snapshot imutável
      data_faturamento: dto.data_faturamento ?? null,
    });
    return this.comissaoRepo.save(c);
  }

  async findAllComissoes(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<Commission>> {
    const { page = 1, limit = 20 } = pagination;
    const [data, total] = await this.comissaoRepo.findAndCount({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Inadimplência ─────────────────────────────────────────

  async createInadimplencia(dto: CreateInadimplenciaDto, tenantId: string): Promise<Inadimplencia> {
    let cliente_id: number | null = null;
    if (dto.cliente_uuid) {
      const rows = await this.dataSource.query(
        `SELECT id FROM clientes WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.cliente_uuid, tenantId],
      );
      cliente_id = (rows[0]?.id as number) ?? null;
    }

    const i = this.inadimplenciaRepo.create({
      uuid: dto.uuid,
      tenant_id: tenantId,
      cliente_id,
      empresa_devedora: dto.empresa_devedora ?? null,
      valor_aberto: dto.valor_aberto ?? null,
      observacao: dto.observacao ?? null,
    });
    return this.inadimplenciaRepo.save(i);
  }

  async findAllInadimplencia(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponse<Inadimplencia>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.inadimplenciaRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.cliente', 'c')
      .where('i.tenant_id = :tenantId', { tenantId })
      .andWhere('i.deleted_at IS NULL');

    const [data, total] = await qb
      .orderBy('i.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Dashboard ─────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<{
    totalVendas: number;
    totalCustoFixo: number;
    totalCustoRotativo: number;
    totalComissoes: number;
    totalInadimplencia: number;
  }> {
    const [movResult, comResult, inadResult] = await Promise.all([
      this.movimentoRepo
        .createQueryBuilder('m')
        .select([
          "SUM(CASE WHEN m.tipo = 'Venda' THEN m.valor ELSE 0 END) AS vendas",
          "SUM(CASE WHEN m.tipo = 'Custo Fixo' THEN m.valor ELSE 0 END) AS custo_fixo",
          "SUM(CASE WHEN m.tipo = 'Custo Rotativo' THEN m.valor ELSE 0 END) AS custo_rotativo",
        ])
        .where('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.deleted_at IS NULL')
        .getRawOne<{ vendas: string; custo_fixo: string; custo_rotativo: string }>(),

      this.comissaoRepo
        .createQueryBuilder('c')
        .select('SUM(c.valor_comissao) AS total')
        .where('c.tenant_id = :tenantId', { tenantId })
        .getRawOne<{ total: string }>(),

      this.inadimplenciaRepo
        .createQueryBuilder('i')
        .select('SUM(i.valor_aberto) AS total')
        .where('i.tenant_id = :tenantId', { tenantId })
        .andWhere('i.deleted_at IS NULL')
        .getRawOne<{ total: string }>(),
    ]);

    return {
      totalVendas: parseFloat(movResult?.vendas ?? '0'),
      totalCustoFixo: parseFloat(movResult?.custo_fixo ?? '0'),
      totalCustoRotativo: parseFloat(movResult?.custo_rotativo ?? '0'),
      totalComissoes: parseFloat(comResult?.total ?? '0'),
      totalInadimplencia: parseFloat(inadResult?.total ?? '0'),
    };
  }
}
