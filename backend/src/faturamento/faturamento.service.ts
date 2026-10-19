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
import { AjustarValorPedidoDto } from './dto/ajustar-valor-pedido.dto';
import { orderValorEfetivo } from '../orders/order-valor';
import { Preposto } from '../prepostos/entities/preposto.entity';
import { PrepostoComissao } from '../prepostos/entities/preposto-comissao.entity';
import { saoPauloDate } from '../common/dates/sao-paulo-date';

const VENDA_PREPOSTO_PAGA = 'A comissão do preposto desta nota já foi paga. Estorne o pagamento na aba Vendas do preposto antes de alterar ou excluir a nota.';

/** Pedidos elegíveis para registrar nota fiscal (fora de em_aberto/cancelado). */
const FATURAVEL_STATUSES = ['liberado', 'parcialmente_faturado', 'faturado'];

export interface PedidoFaturamentoRow {
  uuid: string;
  numero_pedido: number | null;
  status: string;
  /** Lock otimista do pedido — cancelar e ajustar valor pela fila exigem. */
  version: number;
  cliente: string | null;
  fornecedor: string | null;
  /** Valor efetivo: o ajustado pelo ADMIN, quando houver. */
  valor: string;
  /** Total calculado do pedido, antes de qualquer ajuste. */
  valor_original: string;
  valor_ajustado: string | null;
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

  private orderValor(order: Pick<Order, 'valor_ajustado' | 'total_com_imposto' | 'total_sem_imposto'>): string {
    return orderValorEfetivo(order);
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
        version: o.version,
        cliente: o.cliente?.razao_social ?? null,
        fornecedor: o.fornecedor?.razao_social ?? null,
        valor,
        valor_original: money(o.total_com_imposto ?? o.total_sem_imposto ?? 0),
        valor_ajustado: o.valor_ajustado ?? null,
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

    // Só o nome de quem ajustou: o uuid já vem no pedido e o resto do usuário não interessa à tela.
    const ajustadoPor = order.valor_ajustado_por
      ? await this.dataSource.query(
        'SELECT nome FROM usuarios WHERE tenant_id = $1 AND uuid = $2 LIMIT 1',
        [tenantId, order.valor_ajustado_por],
      ) as Array<{ nome: string }>
      : [];

    return {
      ...order,
      notas,
      valor,
      valor_original: money(order.total_com_imposto ?? order.total_sem_imposto ?? 0),
      valorAjustadoPor: ajustadoPor[0] ? { nome: ajustadoPor[0].nome } : null,
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

  /**
   * Venda do preposto nasce com a nota, na mesma transação: percentual do
   * cadastro como snapshot, incidindo sobre o valor da nota. `withDeleted`: o
   * preposto pode ter sido excluído depois que o pedido foi feito — a venda
   * dele continua devida.
   */
  private async criarVendaPreposto(manager: EntityManager, order: Order, nota: NotaFiscal): Promise<void> {
    if (!order.preposto_id) return;
    const preposto = await manager.getRepository(Preposto).findOne({
      where: { id: order.preposto_id, tenant_id: order.tenant_id },
      withDeleted: true,
    });
    if (!preposto) return;
    const repo = manager.getRepository(PrepostoComissao);
    await repo.save(repo.create({
      uuid: randomUUID(),
      tenant_id: order.tenant_id,
      preposto_id: preposto.id,
      pedido_id: order.id,
      nota_fiscal_id: nota.id,
      numero_nfe: nota.numero_nota,
      data_faturamento: nota.data_emissao ?? saoPauloDate(nota.created_at ?? new Date()),
      valor_faturado: nota.valor,
      perc_comissao: money(preposto.percentual_comissao),
      valor_comissao: percentageOf(nota.valor, preposto.percentual_comissao),
      status: 'pendente',
      data_pagamento: null,
      movimento_id: null,
    }));
  }

  private async vendaPrepostoDaNota(manager: EntityManager, notaId: number, tenantId: string): Promise<PrepostoComissao | null> {
    return manager.getRepository(PrepostoComissao).findOne({
      where: { nota_fiscal_id: notaId, tenant_id: tenantId, deleted_at: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
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
    const totalPedido = decimal(this.orderValor(order));

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
      const percentualComissao = dto.perc_comissao ?? 5;

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
        perc_comissao: decimal(percentualComissao).toFixed(2),
        valor_comissao: percentageOf(savedNota.valor, percentualComissao),
        status: 'faturado',
      });
      await commissionRepo.save(commission);
      await this.criarVendaPreposto(manager, order, savedNota);

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
      const vendaPreposto = await this.vendaPrepostoDaNota(manager, nota.id, tenantId);
      if (vendaPreposto?.status === 'pago') throw new ConflictException(VENDA_PREPOSTO_PAGA);

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

      if (vendaPreposto) {
        await manager.getRepository(PrepostoComissao).update(
          { id: vendaPreposto.id, tenant_id: tenantId },
          {
            numero_nfe: saved.numero_nota,
            data_faturamento: saved.data_emissao ?? saoPauloDate(saved.created_at ?? new Date()),
            valor_faturado: saved.valor,
            valor_comissao: percentageOf(saved.valor, vendaPreposto.perc_comissao),
            version: () => '"version" + 1',
          } as any,
        );
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
      const vendaPreposto = await this.vendaPrepostoDaNota(manager, nota.id, tenantId);
      if (vendaPreposto?.status === 'pago') throw new ConflictException(VENDA_PREPOSTO_PAGA);

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
      if (vendaPreposto) await manager.getRepository(PrepostoComissao).softRemove(vendaPreposto);

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

  /**
   * Ajuste do valor do pedido (só ADMIN — o controller barra os demais papéis).
   * Grava em `valor_ajustado` sem tocar os totais calculados, e reavalia o status
   * com o valor novo: baixar o valor até o total já faturado conclui o pedido.
   */
  async ajustarValor(pedidoUuid: string, dto: AjustarValorPedidoDto, tenantId: string, userUuid: string) {
    const motivo = dto.motivo.trim();
    if (motivo.length < 3) throw new BadRequestException('Informe um motivo com pelo menos 3 caracteres.');
    const valor = money(dto.valor);
    if (!decimal(valor).gt(0)) throw new BadRequestException('O valor do pedido deve ser maior que zero.');

    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(Order);
      const order = await orderRepo.findOne({
        where: { uuid: pedidoUuid, tenant_id: tenantId, deleted_at: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException(`Pedido ${pedidoUuid} não encontrado.`);
      if (order.version !== dto.version) {
        throw new ConcurrentModificationException('pedido', pedidoUuid, dto.version, order.version);
      }
      if (order.status !== 'liberado' && order.status !== 'parcialmente_faturado') {
        throw new ConflictException('Só é possível ajustar o valor de pedido liberado ou parcialmente faturado.');
      }
      await this.assertNoActiveFinalization(manager, order);

      const sum = await manager.getRepository(NotaFiscal).createQueryBuilder('n')
        .select('COALESCE(SUM(n.valor), 0)', 'total')
        .where('n.pedido_id = :pedidoId', { pedidoId: order.id })
        .andWhere('n.tenant_id = :tenantId', { tenantId })
        .andWhere('n.deleted_at IS NULL')
        .getRawOne<{ total: string }>();
      if (decimal(valor).lt(decimal(sum?.total ?? 0))) {
        throw new ConflictException('O valor do pedido não pode ficar abaixo do total já faturado.');
      }

      const ajustadoEm = new Date();
      await orderRepo.update(
        { id: order.id, tenant_id: tenantId },
        {
          valor_ajustado: valor,
          valor_ajustado_motivo: motivo,
          valor_ajustado_por: userUuid,
          valor_ajustado_em: ajustadoEm,
          version: () => '"version" + 1',
        } as any,
      );
      order.valor_ajustado = valor;
      await this.recalculateOrderStatus(manager, order);
    });

    return this.findPedidoDetalhe(pedidoUuid, tenantId);
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
