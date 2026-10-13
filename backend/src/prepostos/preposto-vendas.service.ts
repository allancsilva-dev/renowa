import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { PrepostoComissao } from './entities/preposto-comissao.entity';
import { Preposto } from './entities/preposto.entity';
import { FinanceMovement } from '../finance/entities/finance-movement.entity';
import { AlterarPercentualVendaDto, ListPrepostoVendasDto, PagamentoVendaDto } from './dto/preposto-vendas.dto';
import { ConcurrentModificationException } from '../common/errors/concurrent-modification.exception';
import { money, percentageOf } from '../common/decimal/decimal';

/** Tipo que o dashboard soma como custo (finance.service: Custo Fixo | Custo Rotativo). */
const TIPO_SAIDA = 'Custo Rotativo';

export interface PrepostoVendaRow {
  uuid: string;
  version: number;
  status: 'pendente' | 'pago';
  numero_nfe: string | null;
  data_faturamento: string | null;
  data_pagamento: string | null;
  valor_faturado: string;
  perc_comissao: string;
  valor_comissao: string;
  preposto: { uuid: string; nome: string };
  pedido: { uuid: string; numero_pedido: number | null; cliente: string | null };
}

export interface PrepostoVendasTotais {
  faturado: string;
  comissao_pendente: string;
  comissao_paga: string;
}

@Injectable()
export class PrepostoVendasService {
  constructor(
    @InjectRepository(PrepostoComissao) private readonly vendaRepo: Repository<PrepostoComissao>,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, dto: ListPrepostoVendasDto) {
    if (Boolean(dto.data_inicio) !== Boolean(dto.data_fim)) {
      throw new BadRequestException('Informe data_inicio e data_fim juntas.');
    }
    if (dto.data_inicio && dto.data_fim && dto.data_inicio > dto.data_fim) {
      throw new BadRequestException('data_inicio não pode ser posterior a data_fim.');
    }
    const { page = 1, limit = 20 } = dto;

    const qb = this.vendaRepo.createQueryBuilder('v')
      .innerJoin('v.preposto', 'preposto')
      .innerJoin('v.pedido', 'pedido')
      .leftJoin('pedido.cliente', 'cliente')
      .where('v.tenant_id = :tenantId', { tenantId })
      .andWhere('v.deleted_at IS NULL');
    if (dto.preposto_uuid) qb.andWhere('preposto.uuid = :prepostoUuid', { prepostoUuid: dto.preposto_uuid });
    if (dto.data_inicio && dto.data_fim) {
      qb.andWhere('v.data_faturamento BETWEEN :inicio AND :fim', { inicio: dto.data_inicio, fim: dto.data_fim });
    }

    // Totais ignoram o filtro de status de propósito: a tela mostra pendente e
    // pago lado a lado para o mesmo preposto/período.
    const totaisRaw = await qb.clone()
      .select('COALESCE(SUM(v.valor_faturado), 0)', 'faturado')
      .addSelect("COALESCE(SUM(v.valor_comissao) FILTER (WHERE v.status = 'pendente'), 0)", 'comissao_pendente')
      .addSelect("COALESCE(SUM(v.valor_comissao) FILTER (WHERE v.status = 'pago'), 0)", 'comissao_paga')
      .getRawOne<Record<keyof PrepostoVendasTotais, string>>();

    if (dto.status) qb.andWhere('v.status = :status', { status: dto.status });

    const total = await qb.clone().getCount();
    const rows = await qb
      .select([
        'v.uuid AS uuid', 'v.version AS version', 'v.status AS status', 'v.numero_nfe AS numero_nfe',
        "to_char(v.data_faturamento, 'YYYY-MM-DD') AS data_faturamento",
        "to_char(v.data_pagamento, 'YYYY-MM-DD') AS data_pagamento",
        'v.valor_faturado AS valor_faturado', 'v.perc_comissao AS perc_comissao', 'v.valor_comissao AS valor_comissao',
        'preposto.uuid AS preposto_uuid', 'preposto.nome AS preposto_nome',
        'pedido.uuid AS pedido_uuid', 'pedido.numero_pedido AS numero_pedido', 'cliente.razao_social AS cliente',
      ])
      .orderBy('v.data_faturamento', 'DESC', 'NULLS LAST')
      .addOrderBy('v.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<Record<string, string | number | null>>();

    const data: PrepostoVendaRow[] = rows.map((row) => ({
      uuid: String(row.uuid),
      version: Number(row.version),
      status: row.status as PrepostoVendaRow['status'],
      numero_nfe: (row.numero_nfe as string | null) ?? null,
      data_faturamento: (row.data_faturamento as string | null) ?? null,
      data_pagamento: (row.data_pagamento as string | null) ?? null,
      valor_faturado: money(row.valor_faturado as string),
      perc_comissao: money(row.perc_comissao as string),
      valor_comissao: money(row.valor_comissao as string),
      preposto: { uuid: String(row.preposto_uuid), nome: String(row.preposto_nome) },
      pedido: {
        uuid: String(row.pedido_uuid),
        numero_pedido: row.numero_pedido === null ? null : Number(row.numero_pedido),
        cliente: (row.cliente as string | null) ?? null,
      },
    }));

    const totais: PrepostoVendasTotais = {
      faturado: money(totaisRaw?.faturado),
      comissao_pendente: money(totaisRaw?.comissao_pendente),
      comissao_paga: money(totaisRaw?.comissao_paga),
    };

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit), totais } };
  }

  /** Percentual da venda (snapshot) — só enquanto não paga. */
  async alterarPercentual(uuid: string, dto: AlterarPercentualVendaDto, tenantId: string): Promise<PrepostoComissao> {
    return this.dataSource.transaction(async (manager) => {
      const venda = await this.lockVenda(manager, uuid, tenantId, dto.version);
      if (venda.status === 'pago') {
        throw new ConflictException('Comissão já paga. Estorne o pagamento para alterar o percentual.');
      }
      const repo = manager.getRepository(PrepostoComissao);
      await repo.update({ id: venda.id, tenant_id: tenantId }, {
        perc_comissao: money(dto.perc_comissao),
        valor_comissao: percentageOf(venda.valor_faturado, dto.perc_comissao),
        version: () => '"version" + 1',
      } as any);
      return repo.findOneOrFail({ where: { id: venda.id, tenant_id: tenantId } });
    });
  }

  /**
   * Pagar cria a saída no Financeiro e grava o vínculo na mesma transação;
   * estornar (data null) apaga a saída e volta a venda para pendente. A linha
   * da venda fica travada (FOR UPDATE) — dois cliques não geram duas saídas, e
   * o índice único de `movimento_id` é a segunda barreira.
   */
  async registrarPagamento(uuid: string, dto: PagamentoVendaDto, tenantId: string): Promise<PrepostoComissao> {
    return this.dataSource.transaction(async (manager) => {
      const venda = await this.lockVenda(manager, uuid, tenantId, dto.version);
      const repo = manager.getRepository(PrepostoComissao);
      const movimentoRepo = manager.getRepository(FinanceMovement);

      if (dto.data_pagamento) {
        if (venda.status === 'pago') throw new ConflictException('Esta comissão já está paga.');
        if (!(Number(venda.valor_comissao) > 0)) {
          throw new ConflictException('Comissão zerada não gera pagamento. Ajuste o percentual antes.');
        }
        const preposto = await manager.getRepository(Preposto).findOne({
          where: { id: venda.preposto_id, tenant_id: tenantId },
          withDeleted: true,
        });
        const movimento = await movimentoRepo.save(movimentoRepo.create({
          uuid: randomUUID(),
          tenant_id: tenantId,
          tipo: TIPO_SAIDA,
          valor: money(venda.valor_comissao),
          data: dto.data_pagamento,
          descricao: `Comissão preposto ${preposto?.nome ?? ''} – NF ${venda.numero_nfe ?? 's/n'}`.replace(/\s+/g, ' ').slice(0, 255),
        }));
        await repo.update({ id: venda.id, tenant_id: tenantId }, {
          status: 'pago',
          data_pagamento: dto.data_pagamento,
          movimento_id: movimento.id,
          version: () => '"version" + 1',
        } as any);
      } else {
        if (venda.status !== 'pago') throw new ConflictException('Esta comissão não está paga.');
        // Ordem importa: o CHECK de pagamento exige soltar o vínculo junto com o status.
        await repo.update({ id: venda.id, tenant_id: tenantId }, {
          status: 'pendente',
          data_pagamento: null,
          movimento_id: null,
          version: () => '"version" + 1',
        } as any);
        if (venda.movimento_id) {
          await movimentoRepo.update(
            { id: venda.movimento_id, tenant_id: tenantId, deleted_at: IsNull() },
            { deleted_at: () => 'CURRENT_TIMESTAMP', version: () => '"version" + 1' } as any,
          );
        }
      }
      return repo.findOneOrFail({ where: { id: venda.id, tenant_id: tenantId } });
    });
  }

  private async lockVenda(manager: EntityManager, uuid: string, tenantId: string, version: number): Promise<PrepostoComissao> {
    const venda = await manager.getRepository(PrepostoComissao).findOne({
      where: { uuid, tenant_id: tenantId, deleted_at: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!venda) throw new NotFoundException(`Venda ${uuid} não encontrada.`);
    if (venda.version !== version) {
      throw new ConcurrentModificationException('preposto-venda', uuid, version, venda.version);
    }
    return venda;
  }
}
