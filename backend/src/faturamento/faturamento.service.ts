import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { NotaFiscal } from './entities/nota-fiscal.entity';
import { Order } from '../orders/entities/order.entity';
import { Commission } from '../finance/entities/commission.entity';
import { CreateNotaFiscalDto } from './dto/create-nota-fiscal.dto';
import { UpdateNotaFiscalDto } from './dto/update-nota-fiscal.dto';
import { FinalizarFaturamentoDto, ReabrirFaturamentoDto } from './dto/finalizar-faturamento.dto';
import { FaturamentoFinalizacao } from './entities/faturamento-finalizacao.entity';
import { PaginationDto, PaginatedResponse } from '../common/dto/pagination.dto';
import { applySearch } from '../common/persistence/search-filter';
import { decimal, money, percentageOf } from '../common/decimal/decimal';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';

/** Pedidos elegíveis para registrar nota fiscal (fora de em_aberto/cancelado). */
const FATURAVEL_STATUSES = ['liberado', 'parcialmente_faturado', 'faturado'];

/** Data civil (YYYY-MM-DD) em America/Sao_Paulo — `toISOString` usa UTC e vira o dia após 21h. */
function saoPauloDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

export interface PedidoFaturamentoRow {
  uuid: string;
  numero_pedido: number | null;
  status: string;
  cliente: string | null;
  fornecedor: string | null;
  valor: string;
  total_faturado: string;
  divergencia: string;
  /**
   * Origem do pedido na fila. Em pedido externo o `valor` é **declarado** pelo
   * operador, não calculado a partir de itens — quem confere a nota precisa saber
   * disso, porque muda o que a divergência significa.
   */
  origem: string;
  sistema_origem: string | null;
  numero_pedido_externo: string | null;
}

@Injectable()
export class FaturamentoService {
  constructor(
    @InjectRepository(NotaFiscal) private readonly notaRepo: Repository<NotaFiscal>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly dataSource: DataSource,
    @InjectRepository(FaturamentoFinalizacao) private readonly finalizacaoRepo: Repository<FaturamentoFinalizacao>,
  ) {}

  private orderValor(order: Pick<Order, 'total_com_imposto' | 'total_sem_imposto'>): string {
    return money(order.total_com_imposto ?? order.total_sem_imposto ?? 0);
  }

  async findPedidos(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponse<PedidoFaturamentoRow>> {
    const { page = 1, limit = 20 } = pagination;

    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'cliente')
      .leftJoinAndSelect('o.fornecedor', 'fornecedor')
      .where('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.deleted_at IS NULL')
      .andWhere("o.status IN ('liberado', 'parcialmente_faturado')");
    applySearch(qb, pagination.search, {
      text: ['CAST(o.numero_pedido AS TEXT)', 'o.numero_pedido_externo', 'cliente.razao_social', 'fornecedor.razao_social'],
      cnpj: ['cliente.cnpj', 'fornecedor.cnpj'],
    });

    const [orders, total] = await qb
      .orderBy('o.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const orderIds = orders.map((o) => o.id);
    const sums = orderIds.length
      ? await this.notaRepo.createQueryBuilder('n')
        .select('n.pedido_id', 'pedido_id')
        .addSelect('SUM(n.valor)', 'total')
        .where('n.tenant_id = :tenantId', { tenantId })
        .andWhere('n.pedido_id IN (:...orderIds)', { orderIds })
        .andWhere('n.deleted_at IS NULL')
        .groupBy('n.pedido_id')
        .getRawMany<{ pedido_id: string; total: string }>()
      : [];
    const sumMap = new Map(sums.map((s) => [Number(s.pedido_id), money(s.total)]));

    const data: PedidoFaturamentoRow[] = orders.map((o) => {
      const valor = this.orderValor(o);
      const totalFaturado = sumMap.get(o.id) ?? '0.00';
      return {
        uuid: o.uuid,
        numero_pedido: o.numero_pedido,
        status: o.status,
        cliente: o.cliente?.razao_social ?? null,
        fornecedor: o.fornecedor?.razao_social ?? null,
        valor,
        total_faturado: totalFaturado,
        divergencia: money(decimal(valor).minus(totalFaturado)),
        origem: o.origem ?? 'interno',
        sistema_origem: o.sistema_origem ?? null,
        numero_pedido_externo: o.numero_pedido_externo ?? null,
      };
    });

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findPedidoDetalhe(uuid: string, tenantId: string) {
    const order = await this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.cliente', 'cliente')
      .leftJoinAndSelect('o.fornecedor', 'fornecedor')
      .leftJoinAndSelect('o.itens', 'itens', 'itens.deleted_at IS NULL')
      .where('o.uuid = :uuid', { uuid })
      .andWhere('o.tenant_id = :tenantId', { tenantId })
      .andWhere('o.deleted_at IS NULL')
      .getOne();
    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);

    const notas = await this.notaRepo.createQueryBuilder('n')
      .where('n.pedido_id = :pedidoId', { pedidoId: order.id })
      .andWhere('n.tenant_id = :tenantId', { tenantId })
      .andWhere('n.deleted_at IS NULL')
      .orderBy('n.data_emissao', 'DESC')
      .addOrderBy('n.created_at', 'DESC')
      .getMany();

    const valor = this.orderValor(order);
    const totalFaturado = money(notas.reduce((acc, n) => acc.plus(decimal(n.valor)), decimal(0)));
    const finalizacoes = await this.finalizacaoRepo.find({
      where: { pedido_id: order.id, tenant_id: tenantId, deleted_at: IsNull() },
      relations: ['finalizadoPor', 'reabertoPor'],
      order: { created_at: 'DESC' },
    });
    const finalizacoesPublicas = finalizacoes.map((item) => ({
      uuid: item.uuid,
      version: item.version,
      saldo_encerrado: item.saldo_encerrado,
      motivo: item.motivo,
      finalizado_por: item.finalizado_por,
      finalizadoPor: item.finalizadoPor ? { nome: item.finalizadoPor.nome } : null,
      created_at: item.created_at,
      reaberto_at: item.reaberto_at,
      reaberto_por: item.reaberto_por,
      reabertoPor: item.reabertoPor ? { nome: item.reabertoPor.nome } : null,
      reabertura_motivo: item.reabertura_motivo,
    }));

    return {
      ...order,
      notas,
      valor,
      total_faturado: totalFaturado,
      divergencia: money(decimal(valor).minus(totalFaturado)),
      finalizacao_ativa: finalizacoesPublicas.find((item) => !item.reaberto_at) ?? null,
      finalizacoes: finalizacoesPublicas,
    };
  }

  private async activeFinalization(manager: EntityManager, order: Order): Promise<FaturamentoFinalizacao | null> {
    return manager.getRepository(FaturamentoFinalizacao).findOne({
      where: { pedido_id: order.id, tenant_id: order.tenant_id, reaberto_at: IsNull(), deleted_at: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async assertNoActiveFinalization(manager: EntityManager, order: Order): Promise<void> {
    if (await this.activeFinalization(manager, order)) {
      throw new ConflictException('O faturamento foi finalizado manualmente. Reabra-o antes de alterar notas fiscais.');
    }
  }

  /** Recalcula o status do pedido a partir da soma de notas ativas. Chamado sempre dentro de uma transação com o pedido já travado. */
  private async recalculateOrderStatus(manager: EntityManager, order: Order): Promise<void> {
    const sumResult = await manager.getRepository(NotaFiscal)
      .createQueryBuilder('n')
      .select('COALESCE(SUM(n.valor), 0)', 'total')
      .where('n.pedido_id = :pedidoId', { pedidoId: order.id })
      .andWhere('n.tenant_id = :tenantId', { tenantId: order.tenant_id })
      .andWhere('n.deleted_at IS NULL')
      .getRawOne<{ total: string }>();

    const totalNotas = decimal(sumResult?.total ?? 0);
    const totalPedido = decimal(order.total_com_imposto ?? order.total_sem_imposto ?? 0);

    let newStatus: string;
    if (totalNotas.isZero()) {
      newStatus = 'liberado';
    } else if (totalNotas.lt(totalPedido)) {
      newStatus = 'parcialmente_faturado';
    } else {
      // soma >= total do pedido — cobre exato e excesso, sem bloqueio (spec)
      newStatus = 'faturado';
    }

    if (newStatus !== order.status) {
      await manager.getRepository(Order).update(
        { id: order.id, tenant_id: order.tenant_id },
        { status: newStatus, version: () => '"version" + 1' } as any,
      );
      order.status = newStatus;
    }
  }

  async registrarNota(pedidoUuid: string, dto: CreateNotaFiscalDto, tenantId: string): Promise<NotaFiscal> {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const notaRepo = manager.getRepository(NotaFiscal);
      const commissionRepo = manager.getRepository(Commission);

      const order = await orderRepo.findOne({
        where: { uuid: pedidoUuid, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${pedidoUuid} não encontrado.`);
      if (!FATURAVEL_STATUSES.includes(order.status)) {
        throw new ConflictException('Pedido precisa estar liberado para registrar nota fiscal.');
      }
      await this.assertNoActiveFinalization(manager, order);

      const duplicate = await notaRepo.findOne({
        where: [
          { uuid: dto.uuid, tenant_id: tenantId },
          { pedido_id: order.id, tenant_id: tenantId, numero_nota: dto.numero_nota, deleted_at: IsNull() },
        ],
        // O unique (tenant_id, uuid) vale também para linhas soft-deleted.
        withDeleted: true,
      });
      if (duplicate) throw new ConflictException('Esta nota fiscal já foi registrada para o pedido.');

      const nota = notaRepo.create({
        uuid: dto.uuid,
        tenant_id: tenantId,
        pedido_id: order.id,
        numero_nota: dto.numero_nota,
        serie: dto.serie ?? null,
        valor: money(dto.valor),
        data_emissao: dto.data_emissao ?? null,
        observacao: dto.observacao ?? null,
      });
      const savedNota = await notaRepo.save(nota);

      const commission = commissionRepo.create({
        uuid: randomUUID(),
        tenant_id: tenantId,
        pedido_id: order.id,
        nota_fiscal_id: savedNota.id,
        cliente_id: order.cliente_id,
        fornecedor_id: order.fornecedor_id,
        numero_pedido: order.numero_pedido !== null ? String(order.numero_pedido) : null,
        numero_nfe: savedNota.numero_nota,
        data_pedido: order.data,
        data_faturamento: savedNota.data_emissao ?? saoPauloDate(savedNota.created_at ?? new Date()),
        valor_pedido: this.orderValor(order),
        valor_faturado: savedNota.valor,
        perc_comissao: null,
        valor_comissao: '0.00',
        status: 'pendente',
      });
      await commissionRepo.save(commission);

      await this.recalculateOrderStatus(manager, order);

      return savedNota;
    });
  }

  async atualizarNota(uuid: string, dto: UpdateNotaFiscalDto, tenantId: string): Promise<NotaFiscal> {
    return this.dataSource.transaction(async (manager) => {
      const notaRepo = manager.getRepository(NotaFiscal);
      const orderRepo = manager.getRepository(Order);
      const commissionRepo = manager.getRepository(Commission);

      const nota = await notaRepo.findOne({
        where: { uuid, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!nota) throw new NotFoundException(`Nota fiscal ${uuid} não encontrada.`);
      if (nota.version !== dto.version) {
        throw new ConcurrentModificationException('nota-fiscal', uuid, dto.version, nota.version);
      }

      const commission = await commissionRepo.findOne({
        where: { nota_fiscal_id: nota.id, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (commission?.status === 'pago') {
        throw new ConflictException('Não é possível alterar nota fiscal com comissão já paga.');
      }

      // `withDeleted` é deliberado: pedido soft-deletado antes desta guarda
      // existir deixa notas órfãs, e sem isto elas ficariam impossíveis de
      // corrigir ou excluir (404 permanente). Corrigir/excluir a nota de um
      // pedido já apagado é justamente o caminho de saneamento.
      const order = await orderRepo.findOne({
        where: { id: nota.pedido_id, tenant_id: tenantId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Pedido vinculado não encontrado.');
      await this.assertNoActiveFinalization(manager, order);

      if (dto.numero_nota !== undefined && dto.numero_nota !== nota.numero_nota) {
        const duplicate = await notaRepo.findOne({
          where: { pedido_id: nota.pedido_id, tenant_id: tenantId, numero_nota: dto.numero_nota, deleted_at: IsNull() },
        });
        if (duplicate) throw new ConflictException('Já existe uma nota fiscal com este número para este pedido.');
      }

      const novoValor = dto.valor !== undefined ? money(dto.valor) : nota.valor;
      const valorChanged = novoValor !== nota.valor;

      if (dto.numero_nota !== undefined) nota.numero_nota = dto.numero_nota;
      if (dto.serie !== undefined) nota.serie = dto.serie ?? null;
      if (dto.valor !== undefined) nota.valor = novoValor;
      if (dto.data_emissao !== undefined) nota.data_emissao = dto.data_emissao ?? null;
      if (dto.observacao !== undefined) nota.observacao = dto.observacao ?? null;
      const saved = await notaRepo.save(nota);

      if (valorChanged) {
        await this.recalculateOrderStatus(manager, order);
      }

      if (commission) {
        const patch: Record<string, unknown> = {
          numero_nfe: saved.numero_nota,
          data_faturamento: saved.data_emissao ?? saoPauloDate(saved.created_at ?? new Date()),
        };
        if (valorChanged) patch.valor_faturado = saved.valor;
        if (commission.status === 'faturado' && commission.perc_comissao) {
          patch.valor_comissao = percentageOf(saved.valor, commission.perc_comissao);
        }
        await commissionRepo.update({ id: commission.id, tenant_id: tenantId }, patch as any);
      }

      return saved;
    });
  }

  async excluirNota(uuid: string, version: number, tenantId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const notaRepo = manager.getRepository(NotaFiscal);
      const orderRepo = manager.getRepository(Order);
      const commissionRepo = manager.getRepository(Commission);

      const nota = await notaRepo.findOne({
        where: { uuid, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!nota) throw new NotFoundException(`Nota fiscal ${uuid} não encontrada.`);
      if (nota.version !== version) {
        throw new ConcurrentModificationException('nota-fiscal', uuid, version, nota.version);
      }

      const commission = await commissionRepo.findOne({
        where: { nota_fiscal_id: nota.id, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (commission?.status === 'pago') {
        throw new ConflictException('Não é possível excluir nota fiscal com comissão já paga.');
      }

      // `withDeleted` é deliberado: pedido soft-deletado antes desta guarda
      // existir deixa notas órfãs, e sem isto elas ficariam impossíveis de
      // corrigir ou excluir (404 permanente). Corrigir/excluir a nota de um
      // pedido já apagado é justamente o caminho de saneamento.
      const order = await orderRepo.findOne({
        where: { id: nota.pedido_id, tenant_id: tenantId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Pedido vinculado não encontrado.');
      await this.assertNoActiveFinalization(manager, order);

      await notaRepo.softRemove(nota);
      if (commission) await commissionRepo.softRemove(commission);

      await this.recalculateOrderStatus(manager, order);
    });
  }

  async finalizar(
    pedidoUuid: string,
    dto: FinalizarFaturamentoDto,
    tenantId: string,
    userUuid: string,
  ): Promise<FaturamentoFinalizacao> {
    if (dto.motivo.trim().length < 3) throw new BadRequestException('Informe um motivo com pelo menos 3 caracteres.');
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const finalRepo = manager.getRepository(FaturamentoFinalizacao);
      const order = await orderRepo.findOne({
        where: { uuid: pedidoUuid, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${pedidoUuid} não encontrado.`);
      if (order.version !== dto.version) {
        throw new ConcurrentModificationException('pedido', pedidoUuid, dto.version, order.version);
      }
      if (order.status !== 'parcialmente_faturado') {
        throw new ConflictException('Somente pedido parcialmente faturado pode ser finalizado manualmente.');
      }
      if (await this.activeFinalization(manager, order)) {
        throw new ConflictException('Este pedido já possui uma finalização ativa.');
      }
      const duplicateUuid = await finalRepo.findOne({ where: { uuid: dto.uuid, tenant_id: tenantId }, withDeleted: true });
      if (duplicateUuid) throw new ConflictException('Esta finalização já foi registrada.');

      const sum = await manager.getRepository(NotaFiscal).createQueryBuilder('n')
        .select('COALESCE(SUM(n.valor), 0)', 'total')
        .where('n.pedido_id = :pedidoId', { pedidoId: order.id })
        .andWhere('n.tenant_id = :tenantId', { tenantId })
        .andWhere('n.deleted_at IS NULL')
        .getRawOne<{ total: string }>();
      const saldo = decimal(this.orderValor(order)).minus(decimal(sum?.total ?? 0));
      if (!saldo.gt(0)) throw new ConflictException('O pedido não possui saldo positivo para finalizar.');

      const saved = await finalRepo.save(finalRepo.create({
        uuid: dto.uuid,
        tenant_id: tenantId,
        pedido_id: order.id,
        saldo_encerrado: money(saldo),
        motivo: dto.motivo.trim(),
        finalizado_por: userUuid,
        reaberto_at: null,
        reaberto_por: null,
        reabertura_motivo: null,
      }));
      await orderRepo.update(
        { id: order.id, tenant_id: tenantId },
        { status: 'faturado', version: () => '"version" + 1' } as any,
      );
      return saved;
    });
  }

  async reabrir(
    pedidoUuid: string,
    dto: ReabrirFaturamentoDto,
    tenantId: string,
    userUuid: string,
  ): Promise<FaturamentoFinalizacao> {
    if (dto.motivo.trim().length < 3) throw new BadRequestException('Informe um motivo com pelo menos 3 caracteres.');
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { uuid: pedidoUuid, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${pedidoUuid} não encontrado.`);
      if (order.version !== dto.version) {
        throw new ConcurrentModificationException('pedido', pedidoUuid, dto.version, order.version);
      }
      const finalizacao = await this.activeFinalization(manager, order);
      if (!finalizacao) throw new ConflictException('Este pedido não possui finalização ativa.');
      if (finalizacao.version !== dto.finalizacao_version) {
        throw new ConcurrentModificationException('finalizacao-faturamento', finalizacao.uuid, dto.finalizacao_version, finalizacao.version);
      }
      finalizacao.reaberto_at = new Date();
      finalizacao.reaberto_por = userUuid;
      finalizacao.reabertura_motivo = dto.motivo.trim();
      const saved = await manager.getRepository(FaturamentoFinalizacao).save(finalizacao);
      await this.recalculateOrderStatus(manager, order);
      return saved;
    });
  }
}
