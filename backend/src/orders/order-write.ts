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

/**
 * Um item, reduzido ao que decide duplicidade. Aceita a forma que
 * `buildItemValues` devolve (`Partial<OrderItem>`) sem conversão.
 */
export interface ItemCodigoInput {
  uuid?: string;
  produto_id?: number | null;
  codigo_manual?: string | null;
}

/** Item já gravado ou candidato, com o código do catálogo já resolvido. */
interface ItemComCodigo {
  produto_id: number | null;
  codigo: string | null;
  rotulo: string | null;
  /** Decide o fecho da mensagem: item sem código é identificado pelo produto. */
  tipo: 'codigo' | 'produto';
  /** Posição 1-based no payload; `null` para irmão já gravado. */
  posicao: number | null;
}

/**
 * Código do item é a chave de negócio DENTRO do pedido: repetir uma linha infla
 * o total do cabeçalho, a fila de faturamento e a comissão. Até aqui nenhuma das
 * três portas de escrita checava, e o banco também não — deu para gravar 22
 * linhas com o mesmo código num pedido só.
 *
 * Espelha `uq_itens_pedido_codigo_manual` / `uq_itens_pedido_produto` (0044): a
 * guarda dá a mensagem de negócio (com a posição da linha, que o 23505 não tem),
 * o índice garante sob concorrência.
 *
 * O código efetivo é `codigo_manual` OU, na falta dele, `produtos.codigo`. A
 * resolução do catálogo é o que o índice NÃO consegue fazer — índice não cruza
 * tabela —, então é aqui que o manual digitado igual ao código de um produto
 * irmão é pego.
 *
 * `substituiTodos` distingue as duas portas: a REST manda a lista COMPLETA e
 * apaga os itens omitidos, então o array já é o pedido inteiro e consultar
 * irmãos daria falso positivo com a própria linha que vai sumir. O sync manda um
 * item por vez, e aí os irmãos vivos são justamente o que falta comparar.
 */
export async function assertCodigosItensUnicos(
  manager: EntityManager,
  tenantId: string,
  orderId: number,
  itens: ItemCodigoInput[],
  opts: { substituiTodos: boolean },
): Promise<void> {
  const produtoIds = [...new Set(
    itens.map((item) => item.produto_id).filter((id): id is number => id != null),
  )];

  const catalogo = new Map<number, { codigo: string | null; descricao: string }>();
  if (produtoIds.length) {
    const rows = await manager.query(
      `SELECT id, codigo, descricao FROM produtos WHERE tenant_id = $1 AND id = ANY($2::int[])`,
      [tenantId, produtoIds],
    ) as Array<{ id: number; codigo: string | null; descricao: string }>;
    for (const row of rows) catalogo.set(row.id, { codigo: row.codigo, descricao: row.descricao });
  }

  const candidatos: ItemComCodigo[] = itens.map((item, indice) => {
    const doCatalogo = item.produto_id != null ? catalogo.get(item.produto_id) : undefined;
    const codigo = item.codigo_manual?.toString().trim() || doCatalogo?.codigo?.trim() || null;
    return {
      produto_id: item.produto_id ?? null,
      codigo,
      rotulo: codigo ? `Código ${codigo}` : doCatalogo ? `O produto "${doCatalogo.descricao}"` : null,
      tipo: codigo ? 'codigo' : 'produto',
      posicao: indice + 1,
    };
  });

  const irmaos: ItemComCodigo[] = [];
  if (!opts.substituiTodos) {
    const uuids = itens.map((item) => item.uuid).filter((uuid): uuid is string => !!uuid);
    const rows = await manager.query(
      `SELECT i.produto_id, i.codigo_manual, p.codigo AS produto_codigo, p.descricao AS produto_descricao
         FROM itens_pedido i
         LEFT JOIN produtos p ON p.tenant_id = i.tenant_id AND p.id = i.produto_id
        WHERE i.tenant_id = $1 AND i.pedido_id = $2 AND i.deleted_at IS NULL
          AND i.uuid <> ALL($3::uuid[])`,
      [tenantId, orderId, uuids],
    ) as Array<{
      produto_id: number | null;
      codigo_manual: string | null;
      produto_codigo: string | null;
      produto_descricao: string | null;
    }>;
    for (const row of rows) {
      const codigo = row.codigo_manual?.trim() || row.produto_codigo?.trim() || null;
      irmaos.push({
        produto_id: row.produto_id,
        codigo,
        rotulo: codigo
          ? `Código ${codigo}`
          : row.produto_descricao ? `O produto "${row.produto_descricao}"` : null,
        tipo: codigo ? 'codigo' : 'produto',
        posicao: null,
      });
    }
  }

  // Irmãos primeiro: quem já está gravado é sempre o "anterior", e o item que
  // chega é o que a mensagem manda corrigir.
  const porCodigo = new Map<string, ItemComCodigo>();
  const porProduto = new Map<number, ItemComCodigo>();

  for (const entrada of [...irmaos, ...candidatos]) {
    if (entrada.codigo) {
      const anterior = porCodigo.get(entrada.codigo);
      if (anterior) recusar(entrada, anterior);
      porCodigo.set(entrada.codigo, entrada);
    }
    if (entrada.produto_id != null) {
      const anterior = porProduto.get(entrada.produto_id);
      if (anterior) recusar(entrada, anterior);
      porProduto.set(entrada.produto_id, entrada);
    }
  }
}

/**
 * A posição só existe para item que veio no payload. Item já gravado não tem
 * número que faça sentido para quem está olhando a tela, então a mensagem cai
 * para a forma sem posição.
 */
function recusar(entrada: ItemComCodigo, anterior: ItemComCodigo): never {
  const rotulo = entrada.rotulo ?? anterior.rotulo ?? 'Este item';
  const regra = entrada.tipo === 'codigo' ? 'Cada código' : 'Cada produto';
  if (entrada.posicao != null && anterior.posicao != null) {
    throw new ConflictException(
      `${rotulo} está repetido nos itens ${anterior.posicao} e ${entrada.posicao} do pedido. `
      + `${regra} só pode aparecer uma vez no mesmo pedido.`,
    );
  }
  throw new ConflictException(`${rotulo} já está em outro item deste pedido.`);
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
