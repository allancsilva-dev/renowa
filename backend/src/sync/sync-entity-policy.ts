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
   * Allowlist derivada da linha corrente, quando a forma do registro depende do
   * próprio dado. Ausente = vale `writableFields`.
   *
   * Só é consultada em UPDATE, com a linha já lida do banco. Não há janela
   * TOCTOU porque o campo que decide (`origem`) é escrito na criação
   * (`orders.service.ts:143` e `:189`) e nunca atualizado depois.
   */
  readonly writableFieldsFor?: (row: Record<string, unknown>) => readonly string[];
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

const PEDIDOS_WRITABLE = [
  'data', 'status', 'total_sem_imposto', 'total_com_imposto', 'pgt', 'prazo',
  'local_entrega', 'observacao',
] as const;

/**
 * Pedido externo não tem itens: `createExternal`/`updateExternal` mantêm
 * `total_sem_imposto = total_com_imposto = valor` — igualdade que a
 * `0037_lgpd_purga_e_totais_externos.sql` passou a exigir em
 * `pedidos_origem_externa_check`. E a transição de status tem endpoint próprio,
 * com permissão própria e máquina de estados. O sync não pode furar nenhum dos
 * dois: sem este bloqueio o push sobrescreve totais e grava `status` sem
 * `pedidos.liberar`, e a violação do CHECK vaza como 23514 cru. Ver PROB-0074.
 */
const PEDIDO_EXTERNO_BLOQUEADOS: readonly string[] = [
  'status',
  'total_sem_imposto',
  'total_com_imposto',
];

const PEDIDOS_WRITABLE_EXTERNO = PEDIDOS_WRITABLE.filter(
  (campo) => !PEDIDO_EXTERNO_BLOQUEADOS.includes(campo),
);

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
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.PEDIDOS]: {
    table: 'pedidos',
    permissions: syncPermissions('pedidos'),
    writableFields: PEDIDOS_WRITABLE,
    writableFieldsFor: (row: Record<string, unknown>) =>
      row.origem === 'externo' ? PEDIDOS_WRITABLE_EXTERNO : PEDIDOS_WRITABLE,
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
    // cria nem converte a origem de um pedido. `validatePayload` rejeita estes
    // campos com mensagem própria — antes de PROB-0074 o campo era declarativo,
    // não lido em runtime, e a barreira real era só a allowlist.
    serverControlledFields: [...BASE_SERVER_CONTROLLED_FIELDS, 'numero_pedido', 'origem'],
  },
  [SyncEntity.PRODUTOS]: {
    table: 'produtos',
    permissions: syncPermissions('produtos'),
    writableFields: ['codigo', 'descricao', 'preco_base'],
    foreignKeys: {
      fornecedor_uuid: { column: 'fornecedor_id', targetTable: 'fornecedores', nullable: true },
    },
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.FORNECEDORES]: {
    table: 'fornecedores',
    permissions: syncPermissions('fornecedores'),
    writableFields: ['razao_social', 'cnpj'],
    foreignKeys: {},
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.TRANSPORTADORAS]: {
    table: 'transportadoras',
    permissions: syncPermissions('transportadoras'),
    writableFields: ['razao_social', 'cnpj', 'telefone', 'endereco_completo'],
    foreignKeys: {},
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
    writableFields: [
      'codigo_manual', 'descricao_manual', 'qtd_caixas', 'qtd_unitaria',
      'preco_unitario', 'desconto_perc', 'total_item',
    ],
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
