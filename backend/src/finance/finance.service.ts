import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FinanceMovement } from './entities/finance-movement.entity';
import { Commission } from './entities/commission.entity';
import { Inadimplencia } from './entities/inadimplencia.entity';
import { Parceiro } from './entities/parceiro.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { CreateComissaoDto, UpdateComissaoDto } from './dto/create-comissao.dto';
import { CreateInadimplenciaDto } from './dto/create-inadimplencia.dto';
import { CreateParceiroDto, UpdateParceiroDto } from './dto/create-parceiro.dto';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceMovement)
    private readonly movimentoRepo: Repository<FinanceMovement>,
    @InjectRepository(Commission)
    private readonly comissaoRepo: Repository<Commission>,
    @InjectRepository(Inadimplencia)
    private readonly inadimplenciaRepo: Repository<Inadimplencia>,
    @InjectRepository(Parceiro)
    private readonly parceiroRepo: Repository<Parceiro>,
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

  async updateMovimento(uuid: string, dto: UpdateMovementDto, tenantId: string): Promise<FinanceMovement> {
    const m = await this.findOneMovimento(uuid, tenantId);
    if (dto.tipo !== undefined) m.tipo = dto.tipo;
    if (dto.valor !== undefined) m.valor = dto.valor;
    if (dto.data !== undefined) m.data = dto.data ?? null;
    if (dto.descricao !== undefined) m.descricao = dto.descricao ?? null;
    return this.movimentoRepo.save(m);
  }

  async findAllMovimentos(
    tenantId: string,
    pagination: PaginationDto,
    tipo?: string,
    mes?: number,
    ano?: number,
  ): Promise<PaginatedResponse<FinanceMovement>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.movimentoRepo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL');

    if (tipo) qb.andWhere('m.tipo = :tipo', { tipo });
    if (mes && ano) {
      qb.andWhere('EXTRACT(MONTH FROM m.data) = :mes', { mes })
        .andWhere('EXTRACT(YEAR FROM m.data) = :ano', { ano });
    } else if (ano) {
      qb.andWhere('EXTRACT(YEAR FROM m.data) = :ano', { ano });
    }

    const [data, total] = await qb
      .orderBy('m.data', 'DESC')
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

  // ── Fluxo de Caixa ────────────────────────────────────────

  async getFluxoCaixa(tenantId: string, mes: number, ano: number): Promise<{
    receitas: number;
    custos: number;
    saldo: number;
    lancamentos: FinanceMovement[];
  }> {
    const lancamentos = await this.movimentoRepo
      .createQueryBuilder('m')
      .where('m.tenant_id = :tenantId', { tenantId })
      .andWhere('m.deleted_at IS NULL')
      .andWhere('EXTRACT(MONTH FROM m.data) = :mes', { mes })
      .andWhere('EXTRACT(YEAR FROM m.data) = :ano', { ano })
      .orderBy('m.data', 'ASC')
      .getMany();

    // Comissões pagas no mês como receitas (entrada)
    const comissoesResult = await this.comissaoRepo
      .createQueryBuilder('c')
      .select('SUM(c.valor_comissao) AS total')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL')
      .andWhere('c.data_faturamento IS NOT NULL')
      .andWhere('EXTRACT(MONTH FROM c.data_faturamento) = :mes', { mes })
      .andWhere('EXTRACT(YEAR FROM c.data_faturamento) = :ano', { ano })
      .getRawOne<{ total: string }>();

    const receitas = parseFloat(comissoesResult?.total ?? '0');
    const custos = lancamentos.reduce((acc, l) => {
      if (l.tipo === 'Custo Fixo' || l.tipo === 'Custo Rotativo') return acc + Number(l.valor);
      return acc;
    }, 0);

    return { receitas, custos, saldo: receitas - custos, lancamentos };
  }

  // ── Comissões ─────────────────────────────────────────────

  async createComissao(dto: CreateComissaoDto, tenantId: string): Promise<Commission> {
    let cliente_id: number | null = null;
    if (dto.cliente_uuid) {
      const rows = await this.dataSource.query(
        `SELECT id FROM clientes WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.cliente_uuid, tenantId],
      );
      cliente_id = (rows[0]?.id as number) ?? null;
    }

    const c = this.comissaoRepo.create({
      uuid: dto.uuid,
      tenant_id: tenantId,
      cliente_id,
      fornecedor_id: dto.fornecedor_id ?? null,
      numero_pedido: dto.numero_pedido ?? null,
      numero_nfe: dto.numero_nfe ?? null,
      data_pedido: dto.data_pedido ?? null,
      data_faturamento: dto.data_faturamento ?? null,
      valor_pedido: dto.valor_pedido ?? null,
      valor_faturado: dto.valor_faturado ?? null,
      perc_comissao: dto.perc_comissao ?? null,
      valor_comissao: dto.valor_comissao
        ?? (dto.valor_pedido && dto.perc_comissao
          ? Math.round(dto.valor_pedido * (dto.perc_comissao / 100) * 100) / 100
          : 0),
      status: dto.status ?? 'pendente',
    });
    return this.comissaoRepo.save(c);
  }

  async updateComissao(uuid: string, dto: UpdateComissaoDto, tenantId: string): Promise<Commission> {
    const c = await this.comissaoRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!c) throw new NotFoundException(`Comissão ${uuid} não encontrada.`);
    if (dto.numero_nfe !== undefined) c.numero_nfe = dto.numero_nfe ?? null;
    if (dto.data_faturamento !== undefined) c.data_faturamento = dto.data_faturamento ?? null;
    if (dto.valor_faturado !== undefined) c.valor_faturado = dto.valor_faturado ?? null;
    if (dto.valor_comissao !== undefined) c.valor_comissao = dto.valor_comissao;
    if (dto.status !== undefined) c.status = dto.status;
    return this.comissaoRepo.save(c);
  }

  async findAllComissoes(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { fornecedor_id?: number; mes?: number; ano?: number; status?: string },
  ): Promise<PaginatedResponse<Commission>> {
    const { page = 1, limit = 50 } = pagination;

    const qb = this.comissaoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect('c.fornecedor', 'fornecedor')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL');

    if (filters?.fornecedor_id) {
      qb.andWhere('c.fornecedor_id = :fornecedor_id', { fornecedor_id: filters.fornecedor_id });
    }
    if (filters?.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }
    if (filters?.mes && filters?.ano) {
      qb.andWhere('EXTRACT(MONTH FROM c.data_pedido) = :mes', { mes: filters.mes })
        .andWhere('EXTRACT(YEAR FROM c.data_pedido) = :ano', { ano: filters.ano });
    } else if (filters?.ano) {
      qb.andWhere('EXTRACT(YEAR FROM c.data_pedido) = :ano', { ano: filters.ano });
    }

    const [data, total] = await qb
      .orderBy('c.data_pedido', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getResumoComissoes(tenantId: string, mes?: number, ano?: number): Promise<{
    total: number;
    faturado: number;
    pendente: number;
    pago: number;
  }> {
    const qb = this.comissaoRepo
      .createQueryBuilder('c')
      .select([
        'SUM(c.valor_comissao) AS total',
        "SUM(CASE WHEN c.status = 'faturado' THEN c.valor_comissao ELSE 0 END) AS faturado",
        "SUM(CASE WHEN c.status = 'pendente' THEN c.valor_comissao ELSE 0 END) AS pendente",
        "SUM(CASE WHEN c.status = 'pago' THEN c.valor_comissao ELSE 0 END) AS pago",
      ])
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL');

    if (mes && ano) {
      qb.andWhere('EXTRACT(MONTH FROM c.data_pedido) = :mes', { mes })
        .andWhere('EXTRACT(YEAR FROM c.data_pedido) = :ano', { ano });
    } else if (ano) {
      qb.andWhere('EXTRACT(YEAR FROM c.data_pedido) = :ano', { ano });
    }

    const result = await qb.getRawOne<{ total: string; faturado: string; pendente: string; pago: string }>();

    return {
      total: parseFloat(result?.total ?? '0'),
      faturado: parseFloat(result?.faturado ?? '0'),
      pendente: parseFloat(result?.pendente ?? '0'),
      pago: parseFloat(result?.pago ?? '0'),
    };
  }

  async getVendasPorEmpresa(
    tenantId: string,
    mes?: number,
    ano?: number,
    fornecedor_id?: number,
  ): Promise<{ fornecedor_id: number; razao_social: string; total_faturado: number; total_comissao: number; registros: Commission[] }[]> {
    const qb = this.comissaoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect('c.fornecedor', 'fornecedor')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL')
      .andWhere('c.fornecedor_id IS NOT NULL');

    if (fornecedor_id) qb.andWhere('c.fornecedor_id = :fornecedor_id', { fornecedor_id });
    if (mes && ano) {
      qb.andWhere('EXTRACT(MONTH FROM c.data_pedido) = :mes', { mes })
        .andWhere('EXTRACT(YEAR FROM c.data_pedido) = :ano', { ano });
    } else if (ano) {
      qb.andWhere('EXTRACT(YEAR FROM c.data_pedido) = :ano', { ano });
    }

    const registros = await qb.orderBy('c.data_pedido', 'DESC').getMany();

    const mapa = new Map<number, { fornecedor_id: number; razao_social: string; total_faturado: number; total_comissao: number; registros: Commission[] }>();
    for (const r of registros) {
      if (!r.fornecedor_id) continue;
      if (!mapa.has(r.fornecedor_id)) {
        mapa.set(r.fornecedor_id, {
          fornecedor_id: r.fornecedor_id,
          razao_social: r.fornecedor?.razao_social ?? `Fornecedor ${r.fornecedor_id}`,
          total_faturado: 0,
          total_comissao: 0,
          registros: [],
        });
      }
      const entry = mapa.get(r.fornecedor_id)!;
      entry.total_faturado += Number(r.valor_faturado ?? 0);
      entry.total_comissao += Number(r.valor_comissao ?? 0);
      entry.registros.push(r);
    }

    return Array.from(mapa.values());
  }

  async removeComissao(uuid: string, tenantId: string): Promise<void> {
    const c = await this.comissaoRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!c) throw new NotFoundException(`Comissão ${uuid} não encontrada.`);
    await this.comissaoRepo.softDelete(c.id);
  }

  // ── Parceiros Comerciais ───────────────────────────────────

  async createParceiro(dto: CreateParceiroDto, tenantId: string): Promise<Parceiro> {
    let cliente_id: number | null = null;
    if (dto.cliente_uuid) {
      const rows = await this.dataSource.query(
        `SELECT id FROM clientes WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.cliente_uuid, tenantId],
      );
      cliente_id = (rows[0]?.id as number) ?? null;
    }

    const p = this.parceiroRepo.create({
      uuid: dto.uuid,
      tenant_id: tenantId,
      nome_parceiro: dto.nome_parceiro,
      empresa_parceiro: dto.empresa_parceiro ?? null,
      cliente_id,
      fornecedor_id: dto.fornecedor_id ?? null,
      numero_pedido: dto.numero_pedido ?? null,
      numero_nfe: dto.numero_nfe ?? null,
      data_pedido: dto.data_pedido,
      data_faturamento: dto.data_faturamento ?? null,
      valor_pedido: dto.valor_pedido ?? 0,
      valor_faturado: dto.valor_faturado ?? null,
      percentual_comissao: dto.percentual_comissao ?? 50,
      valor_comissao: dto.valor_comissao,
      status: dto.status ?? 'pendente',
    });
    return this.parceiroRepo.save(p);
  }

  async updateParceiro(uuid: string, dto: UpdateParceiroDto, tenantId: string): Promise<Parceiro> {
    const p = await this.parceiroRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!p) throw new NotFoundException(`Parceiro ${uuid} não encontrado.`);
    if (dto.numero_nfe !== undefined) p.numero_nfe = dto.numero_nfe ?? null;
    if (dto.data_faturamento !== undefined) p.data_faturamento = dto.data_faturamento ?? null;
    if (dto.valor_faturado !== undefined) p.valor_faturado = dto.valor_faturado ?? null;
    if (dto.percentual_comissao !== undefined) p.percentual_comissao = dto.percentual_comissao;
    if (dto.valor_comissao !== undefined) p.valor_comissao = dto.valor_comissao;
    if (dto.status !== undefined) p.status = dto.status;
    return this.parceiroRepo.save(p);
  }

  async findAllParceiros(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { nome_parceiro?: string; mes?: number; ano?: number },
  ): Promise<PaginatedResponse<Parceiro>> {
    const { page = 1, limit = 50 } = pagination;

    const qb = this.parceiroRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.cliente', 'cliente')
      .leftJoinAndSelect('p.fornecedor', 'fornecedor')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.deleted_at IS NULL');

    if (filters?.nome_parceiro) {
      qb.andWhere('LOWER(p.nome_parceiro) LIKE :nome', { nome: `%${filters.nome_parceiro.toLowerCase()}%` });
    }
    if (filters?.mes && filters?.ano) {
      qb.andWhere('EXTRACT(MONTH FROM p.data_pedido) = :mes', { mes: filters.mes })
        .andWhere('EXTRACT(YEAR FROM p.data_pedido) = :ano', { ano: filters.ano });
    } else if (filters?.ano) {
      qb.andWhere('EXTRACT(YEAR FROM p.data_pedido) = :ano', { ano: filters.ano });
    }

    const [data, total] = await qb
      .orderBy('p.data_pedido', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async removeParceiro(uuid: string, tenantId: string): Promise<void> {
    const p = await this.parceiroRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!p) throw new NotFoundException(`Parceiro ${uuid} não encontrado.`);
    await this.parceiroRepo.softDelete(p.id);
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

  async updateInadimplencia(uuid: string, dto: Partial<CreateInadimplenciaDto>, tenantId: string): Promise<Inadimplencia> {
    const i = await this.inadimplenciaRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!i) throw new NotFoundException(`Inadimplência ${uuid} não encontrada.`);
    if (dto.empresa_devedora !== undefined) i.empresa_devedora = dto.empresa_devedora ?? null;
    if (dto.valor_aberto !== undefined) i.valor_aberto = dto.valor_aberto ?? null;
    if (dto.observacao !== undefined) i.observacao = dto.observacao ?? null;
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

  async removeInadimplencia(uuid: string, tenantId: string): Promise<void> {
    const i = await this.inadimplenciaRepo.findOne({ where: { uuid, tenant_id: tenantId } });
    if (!i) throw new NotFoundException(`Inadimplência ${uuid} não encontrada.`);
    await this.inadimplenciaRepo.softDelete(i.id);
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
        .andWhere('c.deleted_at IS NULL')
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
