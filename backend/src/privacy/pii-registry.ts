/**
 * Registro executável de PII: quem guarda dado de titular, como a linha chega
 * até ele e o que o ERASURE faz com cada coluna.
 *
 * POR QUE ISTO EXISTE
 * Até PROB-0075 o apagamento era uma sequência de `UPDATE` literais dentro de
 * `privacy.service.ts`. Tabela nova entrava no sistema sem que nada perguntasse
 * se ela guardava PII, e `pedido_fotos`, `chamados_sac` e `itens_chamado_sac`
 * passaram batido: uma foto de nota fiscal — com nome, CNPJ e endereço no
 * próprio pixel — sobrevivia intacta em `bytea` a um ERASURE concluído com
 * sucesso, enquanto a `0034` afirmava por escrito o contrário.
 *
 * Aqui o SQL é GERADO a partir destes dados, e `pii-registry.spec.ts` reprova a
 * build se alguma tabela com `tenant_id` não estiver classificada — em
 * `PII_REGISTRY` ou em `TABELAS_SEM_PII`. Omitir deixou de ser silencioso.
 *
 * Esta é a fonte da verdade do inventário; `docs/LGPD_ARCHITECTURE.md` aponta
 * para cá em vez de manter a lista em prosa.
 */

export type SubjectType = 'CLIENT' | 'USER';

/** Como a linha chega ao titular. */
export type Vinculo =
  /** A própria linha é o titular: `clientes.uuid = :subjectUuid`. */
  | { kind: 'own-uuid'; column: string }
  /** Filha direta, pelo id interno resolvido do titular: `pedidos.cliente_id`. */
  | { kind: 'own-id'; column: string }
  /** Tabela-neta: predicado SQL com `$2` recebendo o id interno do titular. */
  | { kind: 'via'; sql: string };

/** O que fazer com a coluna. */
export type Estrategia =
  | { set: 'null' }
  /** Literal fixo. Único caminho quando a coluna é NOT NULL. */
  | { set: 'literal'; value: string }
  /** Marcador derivado do uuid do titular, passado como parâmetro. */
  | { set: 'marker' }
  /** `col = col + 1`. Invalida token/sessão já emitidos. */
  | { set: 'increment' }
  /** `col = COALESCE(col, clock_timestamp())`. Carimba sem sobrescrever. */
  | { set: 'timestamp-once' };

export interface PiiTablePlan {
  readonly table: string;
  readonly subject: SubjectType;
  readonly vinculo: Vinculo;
  readonly columns: Readonly<Record<string, Estrategia>>;
  /** Marca `deleted_at` junto, quando a linha deve sumir das listagens. */
  readonly softDelete?: boolean;
  /** Incrementa `version` — obrigatório em tabela com concorrência otimista. */
  readonly bumpVersion?: boolean;
  /** Por que esta tabela guarda PII. Entra na revisão, não no SQL. */
  readonly motivo: string;
}

export const PII_REGISTRY: readonly PiiTablePlan[] = [
  // ── Ramo CLIENT ────────────────────────────────────────────────────────────
  {
    table: 'clientes',
    subject: 'CLIENT',
    vinculo: { kind: 'own-uuid', column: 'uuid' },
    columns: {
      razao_social: { set: 'marker' },
      cnpj: { set: 'null' }, email: { set: 'null' }, tel: { set: 'null' },
      endereco: { set: 'null' }, bairro: { set: 'null' }, cidade: { set: 'null' },
      uf: { set: 'null' }, cep: { set: 'null' }, contato: { set: 'null' },
      inscricao_estadual: { set: 'null' }, suframa: { set: 'null' },
      pgt_padrao: { set: 'null' }, prazo: { set: 'null' },
      local_entrega: { set: 'null' }, observacao: { set: 'null' },
    },
    softDelete: true,
    bumpVersion: true,
    motivo: 'O titular. Identificação, contato e endereço.',
  },
  {
    table: 'pedidos',
    subject: 'CLIENT',
    vinculo: { kind: 'own-id', column: 'cliente_id' },
    columns: {
      pgt: { set: 'null' }, prazo: { set: 'null' },
      local_entrega: { set: 'null' }, observacao: { set: 'null' },
    },
    bumpVersion: true,
    motivo:
      'Campos livres podem conter endereço e nome. O pedido em si é preservado: '
      + 'a estratégia é anonimizar mantendo a relação, não apagar o histórico.',
  },
  {
    table: 'chamados_sac',
    subject: 'CLIENT',
    vinculo: { kind: 'own-id', column: 'cliente_id' },
    columns: { observacao: { set: 'null' }, numero_nfe: { set: 'null' } },
    bumpVersion: true,
    motivo: 'PROB-0075. Observação livre e número de nota vinculada ao titular.',
  },
  {
    table: 'itens_chamado_sac',
    subject: 'CLIENT',
    vinculo: { kind: 'via', sql: 'chamado_id IN (SELECT id FROM chamados_sac WHERE tenant_id = $1 AND cliente_id = $2)' },
    columns: { motivo: { set: 'literal', value: '[removido - LGPD]' } },
    bumpVersion: true,
    motivo:
      'PROB-0075. `motivo` é texto livre do atendimento. A coluna é NOT NULL '
      + '(0035:90): NULL abortaria o ERASURE inteiro com 23502, daí o literal.',
  },
  {
    table: 'inadimplencia',
    subject: 'CLIENT',
    vinculo: { kind: 'own-id', column: 'cliente_id' },
    columns: { observacao: { set: 'null' } },
    bumpVersion: true,
    motivo:
      'Observação livre sobre o devedor, ligada ao titular por cliente_id. Mesma '
      + 'natureza de pedidos.observacao, que já era purgada. `empresa_devedora` fica: '
      + 'é razão social da empresa, não do titular, e é o que dá sentido à linha.',
  },
  {
    table: 'notas_fiscais',
    subject: 'CLIENT',
    vinculo: { kind: 'via', sql: 'pedido_id IN (SELECT id FROM pedidos WHERE tenant_id = $1 AND cliente_id = $2)' },
    columns: { observacao: { set: 'null' } },
    bumpVersion: true,
    motivo:
      'Observação livre da nota, alcançável pelo titular via pedido. Número, série '
      + 'e valor ficam: são registro fiscal com retenção legal própria.',
  },

  // ── Ramo USER ──────────────────────────────────────────────────────────────
  {
    table: 'usuarios',
    subject: 'USER',
    vinculo: { kind: 'own-uuid', column: 'uuid' },
    columns: {
      email: { set: 'marker' },
      nome: { set: 'literal', value: 'Titular anonimizado' },
      senha_hash: { set: 'null' },
      roles: { set: 'literal', value: '[]' },
      is_active: { set: 'literal', value: 'false' },
      // Sem o bump, um access token já emitido continua válido depois do
      // apagamento: o titular some do banco e segue autenticado.
      access_token_version: { set: 'increment' },
    },
    softDelete: true,
    motivo: 'O titular no ramo USER: e-mail, nome e credencial.',
  },
  {
    table: 'local_users',
    subject: 'USER',
    vinculo: { kind: 'own-uuid', column: 'auth_user_id' },
    columns: { email: { set: 'marker' }, active: { set: 'literal', value: 'false' } },
    softDelete: true,
    motivo: 'Espelho local do usuário federado; guarda o e-mail.',
  },
  {
    table: 'refresh_tokens',
    subject: 'USER',
    vinculo: { kind: 'own-id', column: 'user_id' },
    columns: { revoked_at: { set: 'timestamp-once' } },
    motivo:
      'Não guarda PII, mas mantém acesso vivo: sem revogar, o titular apagado '
      + 'continua conseguindo renovar sessão.',
  },
  {
    table: 'mobile_sessions',
    subject: 'USER',
    vinculo: { kind: 'own-uuid', column: 'user_uuid' },
    columns: {
      is_active: { set: 'literal', value: 'false' },
      token_version: { set: 'increment' },
    },
    motivo: 'Mesma razão de refresh_tokens: sessão viva de titular apagado.',
  },
];

/**
 * Monta o `UPDATE` de apagamento de uma tabela do registro.
 *
 * Contrato dos parâmetros, igual para toda tabela:
 *   `$1` tenant_id · `$2` uuid ou id interno do titular, conforme o vínculo ·
 *   `$3` marcador, presente só quando alguma coluna usa `set: 'marker'`.
 *
 * A ordem das colunas segue a ordem de declaração no plano — é o que mantém o
 * SQL textualmente comparável ao que existia antes do registro.
 */
export function buildErasureSql(plan: PiiTablePlan): string {
  const atribuicoes = Object.entries(plan.columns).map(([coluna, estrategia]) => {
    switch (estrategia.set) {
      case 'null':
        return `${coluna} = NULL`;
      case 'marker':
        return `${coluna} = $3`;
      case 'increment':
        return `${coluna} = ${coluna} + 1`;
      case 'timestamp-once':
        return `${coluna} = COALESCE(${coluna}, clock_timestamp())`;
      case 'literal':
        return `${coluna} = ${quoteLiteral(coluna, estrategia.value)}`;
    }
  });

  if (plan.softDelete) atribuicoes.push('deleted_at = COALESCE(deleted_at, clock_timestamp())');
  if (plan.bumpVersion) atribuicoes.push('version = version + 1');

  return `UPDATE ${plan.table} SET ${atribuicoes.join(', ')} WHERE tenant_id = $1 AND ${predicado(plan.vinculo)}`;
}

/** `roles` é jsonb e `is_active` é boolean: aspas simples quebrariam os dois. */
function quoteLiteral(coluna: string, valor: string): string {
  if (valor === 'true' || valor === 'false') return valor;
  if (coluna === 'roles') return `'${valor}'::jsonb`;
  return `'${valor.replace(/'/g, "''")}'`;
}

function predicado(vinculo: Vinculo): string {
  switch (vinculo.kind) {
    case 'own-uuid':
    case 'own-id':
      return `${vinculo.column} = $2`;
    case 'via':
      return vinculo.sql;
  }
}

/**
 * Marcador estável derivado do titular, passado como `$3`.
 *
 * Difere por ramo porque o destino difere: no ramo USER ele ocupa colunas de
 * e-mail, que precisam continuar únicas e sintaticamente válidas; no ramo
 * CLIENT ocupa texto livre, onde legibilidade vale mais.
 */
export function markerFor(subject: SubjectType, subjectUuid: string): string {
  return subject === 'USER'
    ? `anon-${subjectUuid}@invalid.local`
    : `Titular anonimizado ${subjectUuid.slice(0, 8)}`;
}

export function plansFor(subject: SubjectType): readonly PiiTablePlan[] {
  return PII_REGISTRY.filter((plan) => plan.subject === subject);
}

/**
 * Tabelas com `tenant_id` que comprovadamente não guardam PII de titular.
 * Cada entrada exige justificativa — é isto que impede a lista de virar o
 * lugar onde tabela nova é despachada sem análise.
 */
export const TABELAS_SEM_PII: Readonly<Record<string, string>> = {
  comissoes:
    'Só identificadores, datas, valores e status. Os campos que poderiam vazar '
    + '(numero_pedido, numero_nfe) são referências, não dado do titular.',
  financeiro_movimentacao:
    '`descricao` é texto livre, mas a tabela não tem vínculo com titular algum: '
    + 'não há cliente_id nem user_id, então nenhuma solicitação a alcança. Se '
    + 'ganhar vínculo, sai desta lista.',
  fornecedores:
    'Pessoa jurídica fornecedora. `lgpd_requests_subject_type_check` só aceita '
    + 'CLIENT e USER — fornecedor não é titular no modelo atual.',
  transportadoras: 'Mesma razão de fornecedores: pessoa jurídica, não titular.',
  produtos: 'Catálogo. Código, descrição e preço.',
  produto_fotos:
    'NÃO ISENTA POR SER INÓCUA, E SIM POR NÃO TER TITULAR: a foto é do produto no '
    + 'catálogo, uma por produto, compartilhada por TODO pedido que o use — de '
    + 'clientes diferentes. Não existe coluna que a ligue a um titular (a '
    + '`origem_pedido_id`, herdada de `pedido_fotos`, saiu na 0042 justamente '
    + 'porque nada a escrevia e porque, se escrevesse, o ERASURE de um cliente '
    + 'apagaria a foto que os outros também usam). Sem vínculo não há solicitação '
    + 'que a alcance, e uma regra de purga aqui seria comando que nunca casa linha '
    + 'nenhuma — controle no papel, risco real. O binário AINDA pode carregar PII se '
    + 'alguém fotografar um documento: o controle é o aviso na tela de cadastro do '
    + 'produto (ProductPhotoField), somado a uma foto por produto, teto de 3 MB e '
    + 'whitelist de mime por magic bytes. Risco residual em PROB-0083. Se a foto '
    + 'voltar a nascer de um pedido, esta tabela volta ao PII_REGISTRY.',
  itens_pedido:
    '`descricao_manual` descreve produto, não pessoa. O que é livre e pode vazar '
    + 'no pedido (observacao, local_entrega) está no cabeçalho, já coberto.',
  parceiros_comerciais:
    'FORA DO ESCOPO ATUAL, NÃO ISENTA: `nome_parceiro` é nome de pessoa física de '
    + 'um TERCEIRO, que não é CLIENT nem USER e portanto não tem tipo de titular '
    + 'nem caminho de solicitação. Apagar por tabela de carona numa solicitação de '
    + 'outro titular seria decisão de negócio, não técnica. Ver PROB-0076.',
  lgpd_requests:
    'Trilha das próprias solicitações. Guarda `subject_uuid`, que é referência ao '
    + 'titular, não atributo dele. Apagar aqui destruiria a prova de que o '
    + 'apagamento foi feito.',
  pii_audit_events:
    'Trilha de auditoria. Guarda nomes de CAMPO e identificadores técnicos; '
    + 'valores de PII são proibidos por contrato (0010).',
  tenant_roles: 'Papéis do tenant: nome e descrição do papel, não de pessoa.',
  tenant_role_permissions: 'Junção papel↔permissão. Só identificadores.',
};
