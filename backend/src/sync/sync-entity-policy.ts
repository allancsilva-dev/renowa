import { SyncEntity } from './dto/sync.dto';

export interface SyncForeignKeyPolicy {
  readonly column: string;
  readonly targetTable: string;
  readonly nullable: boolean;
}

export interface SyncEntityPolicy {
  readonly table: string;
  readonly writableFields: readonly string[];
  readonly foreignKeys: Readonly<Record<string, SyncForeignKeyPolicy>>;
  readonly serverControlledFields: readonly string[];
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

export const SYNC_ENTITY_POLICIES = {
  [SyncEntity.CLIENTES]: {
    table: 'clientes',
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
    writableFields: [
      'data', 'status', 'total_sem_imposto', 'total_com_imposto', 'pgt', 'prazo',
      'local_entrega', 'observacao',
    ],
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
    serverControlledFields: [...BASE_SERVER_CONTROLLED_FIELDS, 'numero_pedido'],
  },
  [SyncEntity.PRODUTOS]: {
    table: 'produtos',
    writableFields: ['codigo', 'descricao', 'preco_base'],
    foreignKeys: {
      fornecedor_uuid: { column: 'fornecedor_id', targetTable: 'fornecedores', nullable: true },
    },
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.FORNECEDORES]: {
    table: 'fornecedores',
    writableFields: ['razao_social', 'cnpj'],
    foreignKeys: {},
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.TRANSPORTADORAS]: {
    table: 'transportadoras',
    writableFields: ['razao_social', 'cnpj', 'telefone', 'endereco_completo'],
    foreignKeys: {},
    serverControlledFields: BASE_SERVER_CONTROLLED_FIELDS,
  },
  [SyncEntity.ITENS_PEDIDO]: {
    table: 'itens_pedido',
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

export function getSyncEntityPolicy(entity: SyncEntity): SyncEntityPolicy {
  return SYNC_ENTITY_POLICIES[entity];
}
