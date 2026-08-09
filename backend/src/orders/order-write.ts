import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { calculateOrderItem, calculateOrderTotals } from './order-calculation';

/**
 * Núcleo de escrita de pedido, compartilhado pelas DUAS portas: a REST
 * (`OrdersService`) e o push de sync (`sync/writers/orders-sync.writer.ts`).
 *
 * POR QUE EXISTE (PROB-0065)
 * Até aqui o push de sync escrevia `pedidos` e `itens_pedido` com SQL cru a
 * partir de uma allowlist de campos: `status` era gravável em pedido interno
 * com apenas `pedidos.editar` (a web exige `pedidos.liberar` e uma máquina de
 * estados), e `total_item`/`total_*` chegavam como ENTRADA, não como derivado —
 * ou seja, um device com aritmética antiga gravava centavos a mais e ninguém
 * recalculava o cabeçalho. Duas portas, duas verdades.
 *
 * Módulo de funções, não `@Injectable`: é a convenção que `order-calculation.ts`
 * (puro) e `order-ownership.ts` (compartilhado) já estabelecem aqui. Toda função
 * recebe o `EntityManager` de quem chama, então roda na transação do chamador —
 * o sync já segura um `QueryRunner`, e abrir transação própria quebraria a
 * atomicidade item + recálculo do cabeçalho.
 */

/**
 * Insumos de um item. Deliberadamente NÃO tem `total_item`, `qtd_total`,
 * `valor_com_desconto`, `valor_com_imposto` nem `total_com_imposto`: todos são
 * derivados por `calculateOrderItem`. Derivado não é campo de entrada em porta
 * nenhuma.
 */
export interface OrderItemInput {
  uuid: string;
  produto_uuid?: string | null;
  codigo_manual?: string | null;
  descricao_manual?: string | null;
  qtd_caixas?: number | string | null;
  qtd_unitaria?: number | string | null;
  preco_unitario?: number | string | null;
  desconto_perc?: number | string | null;
  ipi_perc?: number | string | null;
}

/**
 * Monta os valores de um item a partir dos insumos, com toda a derivação.
 *
 * Mantém as duas guardas que a web já tinha: produto tem que pertencer ao
 * fornecedor do pedido, e item sem produto precisa de código ou descrição
 * manual. `ipi_perc: undefined` grava `null` (e não zero) — a distinção entre
 * "sem IPI" e "IPI zero" é significativa no PDF de validação.
 */
export async function buildItemValues(
  manager: EntityManager,
  dto: OrderItemInput,
  tenantId: string,
  orderId: number,
  supplierId: number,
): Promise<Partial<OrderItem>> {
  let produto_id: number | null = null;
  if (dto.produto_uuid) {
    const products = await manager.query(
      `SELECT id, fornecedor_id FROM produtos WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [dto.produto_uuid, tenantId],
    ) as Array<{ id: number; fornecedor_id: number | null }>;
    if (!products[0] || products[0].fornecedor_id !== supplierId) {
      throw new BadRequestException('Produto inválido ou não vinculado ao fornecedor do pedido.');
    }
    produto_id = products[0].id;
  } else if (!dto.codigo_manual?.toString().trim() && !dto.descricao_manual?.toString().trim()) {
    throw new BadRequestException('Informe um produto ou código/descrição manual para cada item.');
  }

  const calculated = calculateOrderItem(dto);
  return {
    uuid: dto.uuid,
    tenant_id: tenantId,
    pedido_id: orderId,
    produto_id,
    codigo_manual: dto.codigo_manual?.toString().trim() || null,
    descricao_manual: dto.descricao_manual?.toString().trim() || null,
    qtd_caixas: calculated.qtd_caixas,
    qtd_unitaria: calculated.qtd_unitaria,
    qtd_total: calculated.qtd_total,
    preco_unitario: calculated.preco_unitario,
    desconto_perc: calculated.desconto_perc,
    valor_com_desconto: calculated.valor_com_desconto,
    // `null` e ausente significam a mesma coisa — "sem IPI" — e viram `null`.
    // Só valor informado vira número: gravar '0.00' para quem não informou
    // apagaria a distinção que o PDF de validação mostra.
    ipi_perc: dto.ipi_perc == null ? null : calculated.ipi_perc,
    valor_com_imposto: calculated.valor_com_imposto,
    total_item: calculated.total_item_sem_imposto,
    total_com_imposto: calculated.total_item_com_imposto,
  };
}

/** Totais do cabeçalho a partir de itens já derivados. */
export function totalsFromItems(items: Array<Partial<OrderItem>>) {
  return calculateOrderTotals(items.map((item) => ({
    qtd_caixas: item.qtd_caixas!,
    qtd_unitaria: item.qtd_unitaria!,
    qtd_total: item.qtd_total!,
    preco_unitario: item.preco_unitario!,
    desconto_perc: item.desconto_perc!,
    valor_com_desconto: item.valor_com_desconto!,
    ipi_perc: item.ipi_perc!,
    valor_com_imposto: item.valor_com_imposto!,
    total_item_sem_imposto: item.total_item!,
    total_item_com_imposto: item.total_com_imposto!,
  })));
}

/**
 * Quem sabe executar SQL: `EntityManager`, `QueryRunner` ou o próprio
 * `DataSource`. A contagem de notas não precisa de repositório, e aceitar o
 * mínimo mantém `OrdersService` livre para chamar fora de transação.
 */
export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

/**
 * Conta notas fiscais ativas do pedido DENTRO da transação de quem chama —
 * contar por fora abre janela para uma nota emitida no intervalo passar.
 */
export async function countNotasAtivas(
  manager: SqlExecutor,
  tenantId: string,
  orderId: number,
): Promise<number> {
  const rows = await manager.query(
    `SELECT COUNT(*)::int AS total FROM notas_fiscais
      WHERE tenant_id = $1 AND pedido_id = $2 AND deleted_at IS NULL`,
    [tenantId, orderId],
  ) as Array<{ total: number }>;
  return Number(rows[0]?.total ?? 0);
}

/** Paridade com `OrdersService.remove`: nota ativa impede exclusão do pedido. */
export async function assertSemNotasAtivas(
  manager: SqlExecutor,
  tenantId: string,
  orderId: number,
): Promise<void> {
  if (await countNotasAtivas(manager, tenantId, orderId) > 0) {
    throw new ConflictException(
      'Pedido possui notas fiscais ativas e não pode ser excluído. Exclua as notas fiscais primeiro.',
    );
  }
}

/**
 * Igualdade de valor numérico, não de texto: o banco devolve `numeric` na
 * escala da coluna ('183.6000') e o cálculo devolve na sua ('183.60'). Comparar
 * string faria toda linha parecer divergente.
 */
function mesmoValor(atual: unknown, novo: unknown): boolean {
  if (atual == null || novo == null) return atual == null && novo == null;
  const a = Number(atual);
  const b = Number(novo);
  if (Number.isNaN(a) || Number.isNaN(b)) return String(atual) === String(novo);
  return a === b;
}

/**
 * Soft delete de um item, com bump de `version`.
 *
 * Fica aqui, e não em quem chama, porque a escrita em `itens_pedido` pertence a
 * este módulo — é o que o teste de fronteira (`sync-write-boundary.spec.ts`)
 * fixa: SQL literal em `pedidos`/`itens_pedido` só existe nos módulos donos do
 * assunto. Quem exclui é responsável por chamar `recomputeOrderTotals` depois,
 * na mesma transação.
 */
export async function softDeleteOrderItem(
  manager: EntityManager,
  uuid: string,
  tenantId: string,
): Promise<void> {
  await manager.query(
    `UPDATE pedido_item_fotos SET conteudo = NULL, storage_backend = 'purgado',
       deleted_at = NOW(), version = version + 1
     WHERE tenant_id = $2 AND deleted_at IS NULL
       AND item_pedido_id IN (SELECT id FROM itens_pedido WHERE uuid = $1 AND tenant_id = $2)`,
    [uuid, tenantId],
  );
  await manager.query(
    `UPDATE itens_pedido SET deleted_at = NOW(), version = version + 1
      WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
    [uuid, tenantId],
  );
}

export interface LoadOrderOptions {
  /** Recusa o pedido se a origem for outra. Item só existe em pedido interno. */
  requireOrigem?: 'interno' | 'externo';
  /** Recusa fora de `em_aberto` — a mesma regra que a web aplica. */
  requireEmAberto?: boolean;
}

/**
 * Lê o pedido para escrita, travado, e aplica as guardas de domínio.
 *
 * O `pessimistic_write` é funcional, não decorativo: dois devices empurrando
 * itens do mesmo pedido recalculariam o cabeçalho a partir de conjuntos irmãos
 * defasados, e o último a gravar venceria com um total errado.
 */
export async function loadOrderForWrite(
  manager: EntityManager,
  uuid: string,
  tenantId: string,
  opts: LoadOrderOptions = {},
): Promise<Order> {
  const order = await manager.getRepository(Order).findOne({
    where: { uuid, tenant_id: tenantId },
    lock: { mode: 'pessimistic_write' },
  });

  if (!order || order.deleted_at) {
    throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
  }

  const origem = order.origem ?? 'interno';
  if (opts.requireOrigem && origem !== opts.requireOrigem) {
    throw new BadRequestException(
      opts.requireOrigem === 'interno'
        ? `Pedido ${uuid} é de origem externa e não tem itens.`
        : `Pedido ${uuid} é de origem interna.`,
    );
  }

  if (opts.requireEmAberto && order.status !== 'em_aberto') {
    throw new BadRequestException(
      `Pedido ${uuid} não pode ser editado: status atual é '${order.status}', e só 'em_aberto' aceita edição.`,
    );
  }

  return order;
}

/**
 * Re-deriva TODOS os itens vivos do pedido a partir dos insumos gravados e
 * regrava cabeçalho e derivados.
 *
 * Re-derivar é obrigatório, não zelo: `calculateOrderTotals` exige a forma
 * completa de `OrderItemCalculation`, e uma linha escrita pela porta antiga do
 * sync tinha `total_item` sem `qtd_total`/`valor_com_desconto`/`ipi_perc`/
 * `valor_com_imposto`. Ler o que está gravado propagaria o erro em vez de
 * corrigi-lo.
 *
 * `version` do pedido só avança se algum total mudou — bump gratuito viraria
 * 409 na web sem nada ter mudado de fato.
 */
export async function recomputeOrderTotals(
  manager: EntityManager,
  tenantId: string,
  orderId: number,
): Promise<{ total_sem_imposto: string; total_com_imposto: string; changed: boolean }> {
  const itemRepo = manager.getRepository(OrderItem);
  const items = await itemRepo.find({
    where: { pedido_id: orderId, tenant_id: tenantId },
  });
  const vivos = items.filter((item) => !item.deleted_at);

  const derivados = vivos.map((item) => {
    const calculated = calculateOrderItem({
      qtd_caixas: item.qtd_caixas,
      qtd_unitaria: item.qtd_unitaria,
      preco_unitario: item.preco_unitario,
      desconto_perc: item.desconto_perc,
      ipi_perc: item.ipi_perc,
    });
    return {
      entity: item,
      // Só DERIVADOS. Insumo gravado não é reescrito aqui: o banco devolve
      // `preco_unitario` na escala da coluna ('10.0000') e o cálculo devolve na
      // sua ('10.00') — reescrever por diferença de formatação faria toda
      // recomputação sujar toda linha e avançar `updated_at` sem motivo.
      values: {
        qtd_total: calculated.qtd_total,
        valor_com_desconto: calculated.valor_com_desconto,
        valor_com_imposto: calculated.valor_com_imposto,
        total_item: calculated.total_item_sem_imposto,
        total_com_imposto: calculated.total_item_com_imposto,
      } as Partial<OrderItem>,
      // A soma precisa da forma completa de `OrderItemCalculation`.
      paraSoma: {
        qtd_caixas: calculated.qtd_caixas,
        qtd_unitaria: calculated.qtd_unitaria,
        qtd_total: calculated.qtd_total,
        preco_unitario: calculated.preco_unitario,
        desconto_perc: calculated.desconto_perc,
        valor_com_desconto: calculated.valor_com_desconto,
        ipi_perc: calculated.ipi_perc,
        valor_com_imposto: calculated.valor_com_imposto,
        total_item: calculated.total_item_sem_imposto,
        total_com_imposto: calculated.total_item_com_imposto,
      } as Partial<OrderItem>,
    };
  });

  for (const { entity, values } of derivados) {
    const divergente = (Object.keys(values) as Array<keyof OrderItem>)
      .some((campo) => !mesmoValor(entity[campo], values[campo]));
    if (!divergente) continue;
    Object.assign(entity, values);
    await itemRepo.save(entity);
  }

  const totals = totalsFromItems(derivados.map(({ paraSoma }) => paraSoma));

  const orderRepo = manager.getRepository(Order);
  const order = await orderRepo.findOneOrFail({ where: { id: orderId, tenant_id: tenantId } });
  const changed = !mesmoValor(order.total_sem_imposto, totals.total_sem_imposto)
    || !mesmoValor(order.total_com_imposto, totals.total_com_imposto);

  if (changed) {
    await manager.query(
      `UPDATE pedidos SET total_sem_imposto = $1, total_com_imposto = $2, version = version + 1
        WHERE id = $3 AND tenant_id = $4`,
      [totals.total_sem_imposto, totals.total_com_imposto, orderId, tenantId],
    );
  }

  return { ...totals, changed };
}
