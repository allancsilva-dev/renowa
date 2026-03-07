import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FinanceMovement,
  MovimentacaoTipo,
  MovimentacaoStatus,
} from './entities/finance-movement.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';

export class CreateMovementDto {
  tipo: MovimentacaoTipo;
  descricao: string;
  valor: number;
  data_vencimento: string;
  pedido_uuid?: string;
  cliente_uuid?: string;
  observacoes?: string;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceMovement)
    private readonly movementRepo: Repository<FinanceMovement>,
  ) {}

  async create(dto: CreateMovementDto, tenantId: string): Promise<FinanceMovement> {
    const movement = this.movementRepo.create({
      ...dto,
      tenant_id: tenantId,
      status: MovimentacaoStatus.PENDENTE,
    });
    return this.movementRepo.save(movement);
  }

  async findAll(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { tipo?: MovimentacaoTipo; status?: MovimentacaoStatus },
  ): Promise<PaginatedResponse<FinanceMovement>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.movementRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.cliente', 'c')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL');

    if (filters?.tipo) qb.andWhere('m.tipo = :tipo', { tipo: filters.tipo });
    if (filters?.status) qb.andWhere('m.status = :status', { status: filters.status });

    const [data, total] = await qb
      .orderBy('m.data_vencimento', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(uuid: string, tenantId: string): Promise<FinanceMovement> {
    const m = await this.movementRepo.findOne({
      where: { uuid, tenant_id: tenantId },
      relations: ['cliente', 'pedido'],
    });
    if (!m) throw new NotFoundException(`Movimentação ${uuid} não encontrada`);
    return m;
  }

  async pagar(uuid: string, dataPagamento: string, tenantId: string): Promise<FinanceMovement> {
    const m = await this.findOne(uuid, tenantId);
    m.status = MovimentacaoStatus.PAGO;
    m.data_pagamento = dataPagamento;
    return this.movementRepo.save(m);
  }

  async getDashboard(tenantId: string): Promise<{
    totalReceitas: number;
    totalDespesas: number;
    totalPendentes: number;
    totalAtrasados: number;
  }> {
    const result = await this.movementRepo
      .createQueryBuilder('m')
      .select([
        "SUM(CASE WHEN m.tipo = 'RECEITA' AND m.status = 'PAGO' THEN m.valor ELSE 0 END) AS totalReceitas",
        "SUM(CASE WHEN m.tipo = 'DESPESA' AND m.status = 'PAGO' THEN m.valor ELSE 0 END) AS totalDespesas",
        "SUM(CASE WHEN m.status = 'PENDENTE' THEN m.valor ELSE 0 END) AS totalPendentes",
        "SUM(CASE WHEN m.status = 'ATRASADO' THEN m.valor ELSE 0 END) AS totalAtrasados",
      ])
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL')
      .getRawOne<{
        totalreceitas: string;
        totaldespesas: string;
        totalpendentes: string;
        totalatrasados: string;
      }>();

    return {
      totalReceitas: parseFloat(result?.totalreceitas ?? '0'),
      totalDespesas: parseFloat(result?.totaldespesas ?? '0'),
      totalPendentes: parseFloat(result?.totalpendentes ?? '0'),
      totalAtrasados: parseFloat(result?.totalatrasados ?? '0'),
    };
  }
}
