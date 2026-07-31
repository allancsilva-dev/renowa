import { SyncEntity } from './dto/sync.dto';

export interface SyncForeignKeyPolicy {
  readonly column: string;
  readonly targetTable: string;
  readonly nullable: boolean;
}

export interface SyncEntityPolicy {
  readonly table: string;
  readonly permissions: {
    readonly pull: string;
    readonly create: string;
    readonly update: string;
    readonly delete: string;
  };
  readonly writableFields: readonly string[];
  readonly foreignKeys: Readonly<Record<string, SyncForeignKeyPolicy>>;
  readonly serverControlledFields: readonly string[];
  /**
   * Colunas CALCULADAS pelo servidor a partir de outros campos. Nunca entrada,
   * em nenhuma origem, em nenhuma operação.
   *
   * Categoria distinta de `serverControlledFields` de propósito: identidade e
   * auditoria (`id`, `tenant_id`, `created_at`) o cliente não tem como conhecer,
   * mas total de item ele calcula — e calculava, com aritmética que podia ser de
   * outra versão. A mensagem de recusa precisa dizer coisas diferentes nos dois
   * casos: "isso não é seu" versus "mande os insumos, o total é meu" (PROB-0065).
   */
  readonly derivedFields: readonly string[];
  /**
   * Quem escreve esta entidade no push.
   *
   * `generic` = caminho de SQL cru montado a partir da allowlist, correto para
   * cadastro simples. `orders` = passa por `orders/order-write.ts`, o mesmo
   * núcleo que a REST usa, com máquina de estados, guarda de origem e
   * re-derivação dos totais. Pedido não pode ter duas portas de escrita.
   */
  readonly writer: 'generic' | 'orders';
}

const BASE_SERVER_CONTROLLED_FIELDS = [
  'id',
  'uuid',
  'tenant_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'version',
] as const;

/**
 * `status` NÃO está aqui, em nenhuma origem.
 *
 * Transição de status tem endpoint próprio, permissão própria (`pedidos.liberar`)
 * e máquina de estados; `parcialmente_faturado`/`faturado` só nascem de
 * `FaturamentoService#recalculateOrderStatus`. O push exigia apenas
 * `pedidos.editar` e gravava `status` direto na tabela — um device podia marcar
 * `faturado` sem nota fiscal, ou rebaixar pedido faturado para `em_aberto` e
 * então editá-lo pela REST, furando o bloqueio de lá (PROB-0065).
 *
 * PROB-0074 já havia bloqueado o trio em pedido de origem EXTERNA, via
 * `writableFieldsFor`. Agora a regra vale para toda origem, num gate mais cedo e
 * sem ida ao banco — por isso o gancho e a segunda passada de allowlist saíram:
 * gancho ligado a uma função identidade é peso morto.
 *
 * Se um dia o mobile precisar liberar pedido offline, isso vira uma OPERAÇÃO de
 * sync com permissão própria, não um campo de UPDATE.
 */
const PEDIDOS_WRITABLE = [
  'data', 'pgt', 'prazo', 'local_entrega', 'observacao',
] as const;

/**
 * Totais do cabeçalho saem dos itens (`calculateOrderTotals`) no pedido interno,
 * e do valor declarado no externo — onde a `0037` ainda exige
 * `total_sem_imposto = total_com_imposto`. Aceitá-los como entrada permitia ao
 * device gravar total que não bate com item nenhum, e a violação do CHECK vazava
 * como `23514` cru em vez de recusa de negócio.
 */
const PEDIDOS_DERIVED = ['total_sem_imposto', 'total_com_imposto'] as const;

/**
 * `total_item` é o resultado de `calculateOrderItem`, não insumo. FIX-0023 mudou
 * a política de arredondamento (arredonda no total da linha, não no unitário) e
 * o sync não ficou sabendo: um device com a aritmética antiga gravava centavos a
 * mais e ninguém recalculava o cabeçalho.
 *
 * Os outros quatro nunca estiveram na allowlist — mas caíam na mensagem genérica
 * de "campo desconhecido", que manda o cliente errado corrigir a coisa errada.
 */
const ITENS_PEDIDO_DERIVED = [
  'total_item', 'qtd_total', 'valor_com_desconto', 'valor_com_imposto', 'total_com_imposto',
] as const;

export const SYNC_ENTITY_POLICIES = {
  [SyncEntity.CLIENTES]: {
    table: 'clientes',
    permissions: syncPermissions('clientes'),
    writableFields: [
      'razao_social', 'cnpj', 'email', 'tel', 'endereco', 'bairro', 'cidade', 'uf',
      'cep', 'contato', 'inscricao_estadual', 'suframa', 'pgt_padrao', 'prazo',
      'local_entrega', 'observacao',
    ],
    foreignKeys: {
      transportadora_uuid: {
        column: 'transportadora_id',
        targetTable: 'transportadoras',
        nullable: true,
      },
    },
    derivedFields: [],
    writer: 'generic',
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.PEDIDOS]: {
    table: 'pedidos',
    permissions: syncPermissions('pedidos'),
    writableFields: PEDIDOS_WRITABLE,
    derivedFields: PEDIDOS_DERIVED,
    writer: 'orders',
    foreignKeys: {
      cliente_uuid: { column: 'cliente_id', targetTable: 'clientes', nullable: true },
      vendedor_uuid: { column: 'vendedor_id', targetTable: 'usuarios', nullable: true },
      fornecedor_uuid: { column: 'fornecedor_id', targetTable: 'fornecedores', nullable: true },
      transportadora_uuid: {
        column: 'transportadora_id',
        targetTable: 'transportadoras',
        nullable: true,
      },
    },
    // `origem` está aqui porque pedido externo nasce só pela web: o mobile nunca
    // cria nem converte a origem de um pedido. `status` entrou junto na mesma
    // lógica — quem decide o estado do pedido é o servidor (PROB-0065).
    serverControlledFields: [
      ...BASE_SERVER_CONTROLLED_FIELDS, 'numero_pedido', 'origem', 'status',
    ],
  },
  [SyncEntity.PRODUTOS]: {
    table: 'produtos',
    permissions: syncPermissions('produtos'),
    writableFields: ['codigo', 'descricao', 'preco_base'],
    foreignKeys: {
      fornecedor_uuid: { column: 'fornecedor_id', targetTable: 'fornecedores', nullable: true },
    },
    derivedFields: [],
    writer: 'generic',
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.FORNECEDORES]: {
    table: 'fornecedores',
    permissions: syncPermissions('fornecedores'),
    writableFields: ['razao_social', 'cnpj'],
    foreignKeys: {},
    derivedFields: [],
    writer: 'generic',
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.TRANSPORTADORAS]: {
    table: 'transportadoras',
    permissions: syncPermissions('transportadoras'),
    writableFields: ['razao_social', 'cnpj', 'telefone', 'endereco_completo'],
    foreignKeys: {},
    derivedFields: [],
    writer: 'generic',
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.ITENS_PEDIDO]: {
    table: 'itens_pedido',
    permissions: {
      pull: 'pedidos.ver',
      create: 'pedidos.editar',
      update: 'pedidos.editar',
      delete: 'pedidos.editar',
    },
    // `ipi_perc` é INSUMO legítimo — a web o envia em `CreateOrderItemDto` e
    // `calculateOrderItem` o consome. Sem ele, todo item vindo do sync nasceria
    // com IPI zero e `total_com_imposto == total_item`, silenciosamente
    // subtributado.
    writableFields: [
      'codigo_manual', 'descricao_manual', 'qtd_caixas', 'qtd_unitaria',
      'preco_unitario', 'desconto_perc', 'ipi_perc',
    ],
    derivedFields: ITENS_PEDIDO_DERIVED,
    writer: 'orders',
    foreignKeys: {
      pedido_uuid: { column: 'pedido_id', targetTable: 'pedidos', nullable: false },
      produto_uuid: { column: 'produto_id', targetTable: 'produtos', nullable: true },
    },
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
} as const satisfies Record<SyncEntity, SyncEntityPolicy>;

function syncPermissions(module: string): SyncEntityPolicy['permissions'] {
  return {
    pull: `${module}.ver`,
    create: `${module}.criar`,
    update: `${module}.editar`,
    delete: `${module}.deletar`,
  };
}

export function getSyncEntityPolicy(entity: SyncEntity): SyncEntityPolicy {
  return SYNC_ENTITY_POLICIES[entity];
}
