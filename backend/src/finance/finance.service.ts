import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { FinanceMovement } from './entities/finance-movement.entity';
import { Commission } from './entities/commission.entity';
import { Inadimplencia } from './entities/inadimplencia.entity';
import { Parceiro } from './entities/parceiro.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { UpdateMovementDto } from './dto/update-movement.dto';
import { optimisticSoftDelete, optimisticUpdate } from '../common/persistence/optimistic-concurrency';
import { CreateComissaoDto, UpdateComissaoDto } from './dto/create-comissao.dto';
import { CreateInadimplenciaDto, UpdateInadimplenciaDto } from './dto/create-inadimplencia.dto';
import { CreateParceiroDto, UpdateParceiroDto } from './dto/create-parceiro.dto';
import { decimal, money, percentageOf, sumMoney } from '../common/decimal/decimal';

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

  private async resolveSupplierId(
    supplierId: number | undefined,
    tenantId: string,
  ): Promise<number | null> {
    if (supplierId === undefined) return null;

    const rows = await this.dataSource.query(
      `SELECT id FROM fornecedores WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [supplierId, tenantId],
    );

    if (!rows[0]?.id) {
      throw new NotFoundException('Fornecedor não encontrado no tenant.');
    }

    return rows[0].id as number;
  }

  // ── Movimentações ─────────────────────────────────────────

  async createMovimento(dto: CreateMovementDto, tenantId: string): Promise<FinanceMovement> {
    const m = this.movimentoRepo.create({
      uuid: dto.uuid,
      tipo: dto.tipo,
      valor: money(dto.valor),
      data: dto.data ?? null,
      descricao: dto.descricao ?? null,
      tenant_id: tenantId,
    });
    return this.movimentoRepo.save(m);
  }

  async updateMovimento(uuid: string, dto: UpdateMovementDto, tenantId: string): Promise<FinanceMovement> {
    const patch: Partial<FinanceMovement> = {};
    if (dto.tipo !== undefined) patch.tipo = dto.tipo;
    if (dto.valor !== undefined) patch.valor = money(dto.valor);
    if (dto.data !== undefined) patch.data = dto.data ?? null;
    if (dto.descricao !== undefined) patch.descricao = dto.descricao ?? null;
    return optimisticUpdate({
      repository: this.movimentoRepo,
      uuid,
      tenantId,
      expectedVersion: dto.version,
      resource: 'finance-movement',
      notFoundMessage: 'Lançamento ' + uuid + ' não encontrado.',
      patch,
    });
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

  async removeMovimento(uuid: string, version: number, tenantId: string): Promise<void> {
    await optimisticSoftDelete({
      repository: this.movimentoRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'finance-movement',
      notFoundMessage: 'Lançamento ' + uuid + ' não encontrado.',
    });
  }

  // ── Fluxo de Caixa ────────────────────────────────────────

  async getFluxoCaixa(tenantId: string, mes: number, ano: number): Promise<{
    receitas: string;
    custos: string;
    saldo: string;
    faturamentoBruto: string;
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

    // Caixa: só comissões efetivamente PAGAS, agrupadas por data_pagamento
    // (nunca data_faturamento — faturar não é o mesmo que receber).
    const comissoesResult = await this.comissaoRepo
      .createQueryBuilder('c')
      .select('SUM(c.valor_comissao) AS total')
      .where('c.tenant_id = :tenantId', { tenantId })
      .andWhere('c.deleted_at IS NULL')
      .andWhere("c.status = 'pago'")
      .andWhere('c.data_pagamento IS NOT NULL')
      .andWhere('EXTRACT(MONTH FROM c.data_pagamento) = :mes', { mes })
      .andWhere('EXTRACT(YEAR FROM c.data_pagamento) = :ano', { ano })
      .getRawOne<{ total: string }>();

    // Faturamento bruto: soma de notas_fiscais.valor (nunca entra no caixa,
    // é só indicador de volume faturado no período por data de emissão).
    const notasResult = await this.dataSource.query(
      `SELECT COALESCE(SUM(n.valor), 0) AS total FROM notas_fiscais n
       WHERE n.tenant_id = $1 AND n.deleted_at IS NULL
         AND EXTRACT(MONTH FROM n.data_emissao) = $2 AND EXTRACT(YEAR FROM n.data_emissao) = $3`,
      [tenantId, mes, ano],
    ) as Array<{ total: string }>;

    const receitas = money(comissoesResult?.total);
    const faturamentoBruto = money(notasResult[0]?.total);
    const custos = sumMoney(lancamentos
      .filter((l) => l.tipo === 'Custo Fixo' || l.tipo === 'Custo Rotativo')
      .map((l) => l.valor));

    return { receitas, custos, saldo: money(decimal(receitas).minus(custos)), faturamentoBruto, lancamentos };
  }

  // ── Comissões ─────────────────────────────────────────────

  async createComissao(dto: CreateComissaoDto, tenantId: string): Promise<Commission> {
    const fornecedor_id = await this.resolveSupplierId(dto.fornecedor_id, tenantId);
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
      fornecedor_id,
      numero_pedido: dto.numero_pedido ?? null,
      numero_nfe: dto.numero_nfe ?? null,
      data_pedido: dto.data_pedido ?? null,
      data_faturamento: dto.data_faturamento ?? null,
      valor_pedido: dto.valor_pedido === undefined ? null : money(dto.valor_pedido),
      valor_faturado: dto.valor_faturado === undefined ? null : money(dto.valor_faturado),
      perc_comissao: dto.perc_comissao === undefined ? null : decimal(dto.perc_comissao).toFixed(2),
      valor_comissao: dto.valor_comissao !== undefined
        ? money(dto.valor_comissao)
        : (dto.valor_pedido && dto.perc_comissao
          ? percentageOf(dto.valor_pedido, dto.perc_comissao)
          : '0.00'),
      status: dto.status ?? 'pendente',
    });
    return this.comissaoRepo.save(c);
  }

  async updateComissao(uuid: string, dto: UpdateComissaoDto, tenantId: string): Promise<Commission> {
    const patch: Partial<Commission> = {};
    if (dto.numero_nfe !== undefined) patch.numero_nfe = dto.numero_nfe ?? null;
    if (dto.data_faturamento !== undefined) patch.data_faturamento = dto.data_faturamento ?? null;
    if (dto.valor_faturado !== undefined) patch.valor_faturado = dto.valor_faturado === null ? null : money(dto.valor_faturado);
    if (dto.valor_comissao !== undefined) patch.valor_comissao = money(dto.valor_comissao);
    if (dto.status !== undefined) patch.status = dto.status;
    return optimisticUpdate({
      repository: this.comissaoRepo,
      uuid,
      tenantId,
      expectedVersion: dto.version,
      resource: 'commission',
      notFoundMessage: 'Comissão ' + uuid + ' não encontrada.',
      patch,
    });
  }

  /**
   * Informa o percentual de comissão sobre a nota (ou, para comissões legadas
   * sem nota vinculada, sobre valor_faturado/valor_pedido). Exige status
   * 'pendente' — não é possível reinformar percentual de comissão já faturada.
   */
  async informarPercentual(uuid: string, percComissao: string, version: number, tenantId: string): Promise<Commission> {
    const commission = await this.comissaoRepo.findOne({
      where: { uuid, tenant_id: tenantId, deleted_at: IsNull() },
      relations: ['notaFiscal'],
    });
    if (!commission) throw new NotFoundException(`Comissão ${uuid} não encontrada.`);
    if (commission.status !== 'pendente') {
      throw new ConflictException('Comissão precisa estar pendente para informar o percentual.');
    }

    const base = commission.notaFiscal?.valor ?? commission.valor_faturado ?? commission.valor_pedido ?? '0';
    const valorComissao = percentageOf(base, percComissao);

    return optimisticUpdate({
      repository: this.comissaoRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'commission',
      notFoundMessage: `Comissão ${uuid} não encontrada.`,
      patch: { perc_comissao: decimal(percComissao).toFixed(2), valor_comissao: valorComissao, status: 'faturado' },
    });
  }

  /** Registra o pagamento efetivo da comissão. Exige status 'faturado' + data de pagamento. */
  async registrarPagamento(uuid: string, dataPagamento: string, version: number, tenantId: string): Promise<Commission> {
    if (!dataPagamento) throw new BadRequestException('Data de pagamento é obrigatória.');

    const commission = await this.comissaoRepo.findOne({ where: { uuid, tenant_id: tenantId, deleted_at: IsNull() } });
    if (!commission) throw new NotFoundException(`Comissão ${uuid} não encontrada.`);
    if (commission.status !== 'faturado') {
      throw new ConflictException('Comissão precisa estar faturada para registrar o pagamento.');
    }

    return optimisticUpdate({
      repository: this.comissaoRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'commission',
      notFoundMessage: `Comissão ${uuid} não encontrada.`,
      patch: { data_pagamento: dataPagamento, status: 'pago' },
    });
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
      .leftJoinAndSelect(
        'c.fornecedor',
        'fornecedor',
        'fornecedor.tenant_id = :tenantId',
      )
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
    total: string;
    faturado: string;
    pendente: string;
    pago: string;
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
      total: money(result?.total),
      faturado: money(result?.faturado),
      pendente: money(result?.pendente),
      pago: money(result?.pago),
    };
  }

  async getVendasPorEmpresa(
    tenantId: string,
    mes?: number,
    ano?: number,
    fornecedor_id?: number,
  ): Promise<{ fornecedor_id: number; razao_social: string; total_faturado: string; total_comissao: string; registros: Commission[] }[]> {
    const qb = this.comissaoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cliente', 'cliente')
      .leftJoinAndSelect(
        'c.fornecedor',
        'fornecedor',
        'fornecedor.tenant_id = :tenantId',
      )
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

    const mapa = new Map<number, { fornecedor_id: number; razao_social: string; total_faturado: string; total_comissao: string; registros: Commission[] }>();
    for (const r of registros) {
      if (!r.fornecedor_id) continue;
      if (!mapa.has(r.fornecedor_id)) {
        mapa.set(r.fornecedor_id, {
          fornecedor_id: r.fornecedor_id,
          razao_social: r.fornecedor?.razao_social ?? `Fornecedor ${r.fornecedor_id}`,
          total_faturado: '0.00',
          total_comissao: '0.00',
          registros: [],
        });
      }
      const entry = mapa.get(r.fornecedor_id)!;
      entry.total_faturado = sumMoney([entry.total_faturado, r.valor_faturado]);
      entry.total_comissao = sumMoney([entry.total_comissao, r.valor_comissao]);
      entry.registros.push(r);
    }

    return Array.from(mapa.values());
  }

  async removeComissao(uuid: string, version: number, tenantId: string): Promise<void> {
    await optimisticSoftDelete({
      repository: this.comissaoRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'commission',
      notFoundMessage: 'Comissão ' + uuid + ' não encontrada.',
    });
  }

  // ── Parceiros Comerciais ───────────────────────────────────

  async createParceiro(dto: CreateParceiroDto, tenantId: string): Promise<Parceiro> {
    const fornecedor_id = await this.resolveSupplierId(dto.fornecedor_id, tenantId);
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
      fornecedor_id,
      numero_pedido: dto.numero_pedido ?? null,
      numero_nfe: dto.numero_nfe ?? null,
      data_pedido: dto.data_pedido,
      data_faturamento: dto.data_faturamento ?? null,
      valor_pedido: money(dto.valor_pedido ?? 0),
      valor_faturado: dto.valor_faturado === undefined ? null : money(dto.valor_faturado),
      percentual_comissao: decimal(dto.percentual_comissao ?? 50).toFixed(2),
      valor_comissao: money(dto.valor_comissao),
      status: dto.status ?? 'pendente',
    });
    return this.parceiroRepo.save(p);
  }

  async updateParceiro(uuid: string, dto: UpdateParceiroDto, tenantId: string): Promise<Parceiro> {
    const patch: Partial<Parceiro> = {};
    if (dto.numero_nfe !== undefined) patch.numero_nfe = dto.numero_nfe ?? null;
    if (dto.data_faturamento !== undefined) patch.data_faturamento = dto.data_faturamento ?? null;
    if (dto.valor_faturado !== undefined) patch.valor_faturado = dto.valor_faturado === null ? null : money(dto.valor_faturado);
    if (dto.percentual_comissao !== undefined) patch.percentual_comissao = decimal(dto.percentual_comissao).toFixed(2);
    if (dto.valor_comissao !== undefined) patch.valor_comissao = money(dto.valor_comissao);
    if (dto.status !== undefined) patch.status = dto.status;
    return optimisticUpdate({
      repository: this.parceiroRepo,
      uuid,
      tenantId,
      expectedVersion: dto.version,
      resource: 'commercial-partner',
      notFoundMessage: 'Parceiro ' + uuid + ' não encontrado.',
      patch,
    });
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
      .leftJoinAndSelect(
        'p.fornecedor',
        'fornecedor',
        'fornecedor.tenant_id = :tenantId',
      )
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

  async removeParceiro(uuid: string, version: number, tenantId: string): Promise<void> {
    await optimisticSoftDelete({
      repository: this.parceiroRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'commercial-partner',
      notFoundMessage: 'Parceiro ' + uuid + ' não encontrado.',
    });
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
      valor_aberto: dto.valor_aberto === undefined ? null : money(dto.valor_aberto),
      observacao: dto.observacao ?? null,
    });
    return this.inadimplenciaRepo.save(i);
  }

  async updateInadimplencia(uuid: string, dto: UpdateInadimplenciaDto, tenantId: string): Promise<Inadimplencia> {
    const patch: Partial<Inadimplencia> = {};
    if (dto.empresa_devedora !== undefined) patch.empresa_devedora = dto.empresa_devedora ?? null;
    if (dto.valor_aberto !== undefined) patch.valor_aberto = dto.valor_aberto === null ? null : money(dto.valor_aberto);
    if (dto.observacao !== undefined) patch.observacao = dto.observacao ?? null;
    return optimisticUpdate({
      repository: this.inadimplenciaRepo,
      uuid,
      tenantId,
      expectedVersion: dto.version,
      resource: 'delinquency',
      notFoundMessage: 'Inadimplência ' + uuid + ' não encontrada.',
      patch,
    });
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

  async removeInadimplencia(uuid: string, version: number, tenantId: string): Promise<void> {
    await optimisticSoftDelete({
      repository: this.inadimplenciaRepo,
      uuid,
      tenantId,
      expectedVersion: version,
      resource: 'delinquency',
      notFoundMessage: 'Inadimplência ' + uuid + ' não encontrada.',
    });
  }

  // ── Dashboard ─────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<{
    totalVendas: string;
    totalCustoFixo: string;
    totalCustoRotativo: string;
    totalComissoes: string;
    totalInadimplencia: string;
    pedidosAbertos: number;
    produtosAtivos: number;
    carteira: { total: number; ativos: number; inativos: number; prospect: number };
    positivacao: { clientesComPedidoNoMes: number; totalClientes: number };
    vendasMensais: { mes: string; valor: string }[];
    curvaAbc: { cliente: string; valor: string; badge: 'Prioridade' | 'Atenção' | 'Regular' }[];
  }> {
    const [
      movResult,
      comResult,
      inadResult,
      pedidosAbertosResult,
      produtosAtivosResult,
      totalClientesResult,
      clientesAtivosResult,
      clientesComHistoricoResult,
      positivacaoResult,
      vendasMensaisRows,
      curvaAbcRows,
      totalVendasPedidosResult,
    ] = await Promise.all([
      this.movimentoRepo
        .createQueryBuilder('m')
        .select([
          "SUM(CASE WHEN m.tipo = 'Custo Fixo' THEN m.valor ELSE 0 END) AS custo_fixo",
          "SUM(CASE WHEN m.tipo = 'Custo Rotativo' THEN m.valor ELSE 0 END) AS custo_rotativo",
        ])
        .where('m.tenant_id = :tenantId', { tenantId })
        .andWhere('m.deleted_at IS NULL')
        .getRawOne<{ custo_fixo: string; custo_rotativo: string }>(),

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

      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM pedidos
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'em_aberto'`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM produtos
         WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM clientes
         WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT COUNT(DISTINCT cliente_id)::int AS total FROM pedidos
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'
           AND data >= (CURRENT_DATE - INTERVAL '90 days')`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT COUNT(DISTINCT cliente_id)::int AS total FROM pedidos
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT COUNT(DISTINCT cliente_id)::int AS total FROM pedidos
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'
           AND data >= date_trunc('month', CURRENT_DATE)`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT to_char(date_trunc('month', data), 'YYYY-MM') AS mes,
                SUM(COALESCE(total_com_imposto, total_sem_imposto, 0)) AS valor
         FROM pedidos
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'
           AND data >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
         GROUP BY 1
         ORDER BY 1`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT c.razao_social AS cliente,
                SUM(COALESCE(p.total_com_imposto, p.total_sem_imposto, 0)) AS valor
         FROM pedidos p
         JOIN clientes c ON c.id = p.cliente_id AND c.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL
           AND p.status <> 'cancelado'
         GROUP BY c.id, c.razao_social
         ORDER BY valor DESC
         LIMIT 10`,
        [tenantId],
      ),

      this.dataSource.query(
        `SELECT SUM(COALESCE(total_com_imposto, total_sem_imposto, 0)) AS total
         FROM pedidos
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'`,
        [tenantId],
      ),
    ]);

    const totalClientes = Number(totalClientesResult[0]?.total ?? 0);
    const clientesAtivos = Number(clientesAtivosResult[0]?.total ?? 0);
    const clientesComHistorico = Number(clientesComHistoricoResult[0]?.total ?? 0);
    const clientesProspect = Math.max(totalClientes - clientesComHistorico, 0);
    const clientesInativos = Math.max(clientesComHistorico - clientesAtivos, 0);

    const vendasMensais = this.buildVendasMensais(
      vendasMensaisRows as { mes: string; valor: string }[],
    );

    const curvaAbc = this.buildCurvaAbc(
      curvaAbcRows as { cliente: string; valor: string }[],
    );

    return {
      totalVendas: money(totalVendasPedidosResult[0]?.total),
      totalCustoFixo: money(movResult?.custo_fixo),
      totalCustoRotativo: money(movResult?.custo_rotativo),
      totalComissoes: money(comResult?.total),
      totalInadimplencia: money(inadResult?.total),
      pedidosAbertos: Number(pedidosAbertosResult[0]?.total ?? 0),
      produtosAtivos: Number(produtosAtivosResult[0]?.total ?? 0),
      carteira: {
        total: totalClientes,
        ativos: clientesAtivos,
        inativos: clientesInativos,
        prospect: clientesProspect,
      },
      positivacao: {
        clientesComPedidoNoMes: Number(positivacaoResult[0]?.total ?? 0),
        totalClientes,
      },
      vendasMensais,
      curvaAbc,
    };
  }

  private buildVendasMensais(rows: { mes: string; valor: string }[]): { mes: string; valor: string }[] {
    const byMonth = new Map(rows.map((r) => [r.mes, r.valor]));
    const result: { mes: string; valor: string }[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      result.push({ mes: key, valor: money(byMonth.get(key)) });
    }
    return result;
  }

  private buildCurvaAbc(
    rows: { cliente: string; valor: string }[],
  ): { cliente: string; valor: string; badge: 'Prioridade' | 'Atenção' | 'Regular' }[] {
    const total = rows.reduce((acc, r) => acc.plus(decimal(r.valor)), decimal(0));
    if (total.isZero()) return [];

    let acumulado = decimal(0);
    return rows.map((r) => {
      acumulado = acumulado.plus(decimal(r.valor));
      const pctAcumulado = acumulado.div(total).mul(100);
      const badge: 'Prioridade' | 'Atenção' | 'Regular' =
        pctAcumulado.lte(80) ? 'Prioridade' : pctAcumulado.lte(95) ? 'Atenção' : 'Regular';
      return { cliente: r.cliente, valor: money(r.valor), badge };
    });
  }
}
