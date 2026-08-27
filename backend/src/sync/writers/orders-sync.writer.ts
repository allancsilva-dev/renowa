import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';
import { OrderItem } from '../../orders/entities/order-item.entity';
import {
  assertSemNotasAtivas,
  assertCodigosItensUnicos,
  buildItemValues,
  loadOrderForWrite,
  recomputeOrderTotals,
  softDeleteOrderItem,
} from '../../orders/order-write';
import { SyncEntity, SyncOperation } from '../dto/sync.dto';

/**
 * A porta de escrita de PEDIDO no push de sync.
 *
 * Antes disto o push montava SQL cru a partir da allowlist e gravava direto na
 * tabela: sem máquina de estados, sem guarda de nota fiscal, sem recálculo de
 * cabeçalho — uma segunda porta que desconhecia as regras da primeira
 * (PROB-0065). Agora as duas portas chamam `orders/order-write.ts`.
 *
 * Recebe o `EntityManager` da transação do `SyncService` (v1: a transação do
 * item; v2: dentro do `SAVEPOINT sync_item_v2`), então item e recálculo do
 * cabeçalho são atômicos, e uma recusa aqui reverte tudo pelo caminho de erro
 * que já existe.
 *
 * Recusa de negócio é `BadRequestException` de propósito: o v2 já a classifica
 * como `rejected`/`VALIDATION_FAILED`/`retryable: false` (estado terminal — pare
 * de tentar, corrija o cliente), e o v1 a transforma em `{status:'error'}` com a
 * mensagem. Erro que NÃO for de negócio continua subindo e vira `retryable`.
 */
@Injectable()
export class OrdersSyncWriter {
  /**
   * O `pedido_uuid` do item só é aceito na criação. Em UPDATE o pai vem da
   * linha gravada: mover item de pedido pela porta do sync mudaria os totais de
   * DOIS pedidos, e o de origem nem seria lido.
   */
  private async resolvePedidoDoItem(
    manager: EntityManager,
    operation: SyncOperation,
    payload: Record<string, unknown>,
    uuid: string,
    tenantId: string,
  ): Promise<Order> {
    if (operation === SyncOperation.CREATE) {
      const pedidoUuid = payload.pedido_uuid;
      if (typeof pedidoUuid !== 'string' || !pedidoUuid) {
        throw new BadRequestException('pedido_uuid é obrigatório para criar item de pedido.');
      }
      return loadOrderForWrite(manager, pedidoUuid, tenantId, {
        requireOrigem: 'interno', requireEmAberto: true,
      });
    }

    if (payload.pedido_uuid !== undefined) {
      throw new BadRequestException(
        'pedido_uuid não pode ser alterado: mova o item excluindo e recriando no pedido de destino.',
      );
    }

    const rows = await manager.query(
      `SELECT p.uuid FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id
        WHERE i.uuid = $1 AND i.tenant_id = $2`,
      [uuid, tenantId],
    ) as Array<{ uuid: string }>;
    if (!rows[0]) {
      throw new BadRequestException(`Item ${uuid} não encontrado.`);
    }

    return loadOrderForWrite(manager, rows[0].uuid, tenantId, {
      requireOrigem: 'interno', requireEmAberto: true,
    });
  }

  /**
   * `ipi_perc` é insumo, mas o payload do sync é esparso.
   *
   * Ordem: valor enviado (inclusive `null` explícito) → valor já gravado no item
   * (UPDATE parcial não pode zerar o imposto) → default do produto do catálogo
   * (é o que a tela faz ao escolher o produto) → `null`. Sem esta cadeia, todo
   * item vindo do sync nasceria com IPI zero e total subtributado.
   */
  private async resolveIpiPerc(
    manager: EntityManager,
    payload: Record<string, unknown>,
    itemAtual: OrderItem | null,
    produtoUuid: string | null,
    tenantId: string,
  ): Promise<number | string | null> {
    if (Object.prototype.hasOwnProperty.call(payload, 'ipi_perc')) {
      return payload.ipi_perc as number | string | null;
    }
    if (itemAtual) return itemAtual.ipi_perc ?? null;

    if (produtoUuid) {
      const rows = await manager.query(
        `SELECT ipi_perc FROM produtos WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [produtoUuid, tenantId],
      ) as Array<{ ipi_perc: string | null }>;
      return rows[0]?.ipi_perc ?? null;
    }

    return null;
  }

  /** CREATE/UPDATE de item: deriva tudo e recalcula o cabeçalho na mesma transação. */
  async writeItem(
    manager: EntityManager,
    operation: SyncOperation,
    uuid: string,
    payload: Record<string, unknown>,
    tenantId: string,
  ): Promise<{ id: number; pedidoId: number }> {
    const order = await this.resolvePedidoDoItem(manager, operation, payload, uuid, tenantId);
    if (!order.fornecedor_id) {
      throw new BadRequestException(
        `Pedido ${order.uuid} não tem fornecedor: não é possível validar o produto do item.`,
      );
    }

    const itemRepo = manager.getRepository(OrderItem);
    const atual = operation === SyncOperation.CREATE
      ? null
      : await itemRepo.findOne({ where: { uuid, tenant_id: tenantId } });

    if (operation !== SyncOperation.CREATE && !atual) {
      throw new BadRequestException(`Item ${uuid} não encontrado.`);
    }

    const produtoUuid = (payload.produto_uuid as string | undefined)
      ?? (atual?.produto_id ? await this.uuidDoProduto(manager, atual.produto_id, tenantId) : null);

    const values = await buildItemValues(
      manager,
      {
        uuid,
        produto_uuid: produtoUuid,
        codigo_manual: (payload.codigo_manual ?? atual?.codigo_manual ?? null) as string | null,
        descricao_manual: (payload.descricao_manual ?? atual?.descricao_manual ?? null) as string | null,
        qtd_caixas: (payload.qtd_caixas ?? atual?.qtd_caixas ?? null) as string | null,
        qtd_unitaria: (payload.qtd_unitaria ?? atual?.qtd_unitaria ?? null) as string | null,
        preco_unitario: (payload.preco_unitario ?? atual?.preco_unitario ?? null) as string | null,
        desconto_perc: (payload.desconto_perc ?? atual?.desconto_perc ?? null) as string | null,
        ipi_perc: await this.resolveIpiPerc(manager, payload, atual, produtoUuid, tenantId),
      },
      tenantId,
      order.id,
      order.fornecedor_id,
    );

    // Um item por vez: os irmãos vivos do pedido é que precisam ser comparados.
    // Vale também para o UPDATE, que RESSUSCITA item soft-deletado logo abaixo —
    // o revivido pode colidir com um vivo de mesmo código.
    await assertCodigosItensUnicos(manager, tenantId, order.id, [{ ...values, uuid }], {
      substituiTodos: false,
    });

    const salvo = atual
      ? await itemRepo.save(Object.assign(atual, values, { deleted_at: null }))
      : await itemRepo.save(itemRepo.create(values));

    await recomputeOrderTotals(manager, tenantId, order.id);
    return { id: salvo.id, pedidoId: order.id };
  }

  private async uuidDoProduto(
    manager: EntityManager,
    produtoId: number,
    tenantId: string,
  ): Promise<string | null> {
    const rows = await manager.query(
      `SELECT uuid FROM produtos WHERE id = $1 AND tenant_id = $2`,
      [produtoId, tenantId],
    ) as Array<{ uuid: string }>;
    return rows[0]?.uuid ?? null;
  }

  /** DELETE de item: soft delete + recálculo do cabeçalho. */
  async deleteItem(
    manager: EntityManager,
    uuid: string,
    tenantId: string,
  ): Promise<{ pedidoId: number }> {
    const order = await this.resolvePedidoDoItem(
      manager, SyncOperation.DELETE, {}, uuid, tenantId,
    );

    await softDeleteOrderItem(manager, uuid, tenantId);

    await recomputeOrderTotals(manager, tenantId, order.id);
    return { pedidoId: order.id };
  }

  /**
   * UPDATE de cabeçalho: só os campos livres (`data`, `pgt`, `prazo`,
   * `local_entrega`, `observacao`). Status e totais não são entrada, então aqui
   * sobra a guarda de estado — que passou a valer para as DUAS origens.
   */
  async assertPedidoEditavel(
    manager: EntityManager,
    uuid: string,
    tenantId: string,
  ): Promise<Order> {
    return loadOrderForWrite(manager, uuid, tenantId, { requireEmAberto: true });
  }

  /**
   * DELETE de pedido: a guarda de nota fiscal ativa que a REST sempre teve
   * (`OrdersService.remove`) e o push não tinha — no v1 o DELETE nem lia a linha.
   */
  async assertPedidoRemovivel(
    manager: EntityManager,
    uuid: string,
    tenantId: string,
  ): Promise<Order> {
    const order = await loadOrderForWrite(manager, uuid, tenantId);
    await assertSemNotasAtivas(manager, tenantId, order.id);
    return order;
  }

  /** Entidades que esta porta atende. */
  atende(entity: SyncEntity): boolean {
    return entity === SyncEntity.PEDIDOS || entity === SyncEntity.ITENS_PEDIDO;
  }
}
