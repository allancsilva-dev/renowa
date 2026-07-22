/**
 * db:verify — auditoria somente leitura de drift de schema.
 *
 * POR QUE ISTO EXISTE
 * O `synchronize` do TypeORM (PROB-0059) reconciliou o banco contra os
 * metadados das entities e apagou tudo que não é expressável nelas: 20 CHECK
 * constraints, os índices únicos parciais de regra de negócio e os triggers de
 * `updated_at`. As migrations continuavam marcadas como aplicadas em
 * `schema_migrations`, então `schema_migrations` PROVOU ser insuficiente como
 * fonte de verdade: ela diz o que rodou, não o que sobreviveu.
 *
 * Este script compara o catálogo real do PostgreSQL contra o inventário
 * esperado abaixo e sai com código != 0 se algo faltar ou divergir. É o portão
 * a ser executado ANTES de qualquer deploy, inclusive contra PRODUÇÃO, onde
 * ainda não se sabe se o mesmo drift existe.
 *
 * SOMENTE LEITURA: nenhum DDL, DML ou transação de escrita. Seguro em prod.
 *
 * USO
 *   npm run build
 *   DATABASE_URL=postgresql://user:pass@host:porta/base npm run db:verify
 *
 * Saída: 0 = schema íntegro; 1 = drift encontrado; 2 = falha de execução.
 */
import { Client } from 'pg';

type CheckEsperado = {
  tabela: string;
  nome: string;
  /** false = criada `NOT VALID` na migration de origem, intencionalmente. */
  validado: boolean;
  /** Expressão na forma canônica do PostgreSQL (`pg_get_constraintdef`). */
  expressao: string;
  origem: string;
};

type IndiceParcialEsperado = {
  tabela: string;
  /** Colunas na ordem do índice. O nome do índice NÃO é comparado: o
   *  synchronize renomeia índices livremente (`IDX_<hash>`), então casar por
   *  nome geraria falso positivo. A identidade real é (tabela, colunas). */
  colunas: string[];
  predicado: string;
  regra: string;
  origem: string;
};

const CHECKS_ESPERADOS: CheckEsperado[] = [
  // Concorrência otimista: `version` nunca pode zerar/negativar.
  { tabela: 'pedidos', nome: 'pedidos_version_check', validado: true, expressao: 'version > 0', origem: '0007' },
  { tabela: 'financeiro_movimentacao', nome: 'financeiro_movimentacao_version_check', validado: true, expressao: 'version > 0', origem: '0007' },
  { tabela: 'comissoes', nome: 'comissoes_version_check', validado: true, expressao: 'version > 0', origem: '0007' },
  { tabela: 'parceiros_comerciais', nome: 'parceiros_comerciais_version_check', validado: true, expressao: 'version > 0', origem: '0007' },
  { tabela: 'inadimplencia', nome: 'inadimplencia_version_check', validado: true, expressao: 'version > 0', origem: '0007' },
  { tabela: 'clientes', nome: 'clientes_version_check', validado: true, expressao: 'version > 0', origem: '0009' },
  { tabela: 'produtos', nome: 'produtos_version_check', validado: true, expressao: 'version > 0', origem: '0009' },
  { tabela: 'fornecedores', nome: 'fornecedores_version_check', validado: true, expressao: 'version > 0', origem: '0009' },
  { tabela: 'transportadoras', nome: 'transportadoras_version_check', validado: true, expressao: 'version > 0', origem: '0009' },
  { tabela: 'itens_pedido', nome: 'itens_pedido_version_check', validado: true, expressao: 'version > 0', origem: '0009' },
  { tabela: 'notas_fiscais', nome: 'notas_fiscais_version_check', validado: true, expressao: 'version > 0', origem: '0028' },

  // LGPD: enums fechados. Sem eles a trilha de auditoria aceita qualquer texto.
  {
    tabela: 'pii_audit_events',
    nome: 'pii_audit_events_action_check',
    validado: true,
    expressao: "action = ANY (ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','AUDIT_READ'])",
    origem: '0010',
  },
  { tabela: 'lgpd_requests', nome: 'lgpd_requests_subject_type_check', validado: true, expressao: "subject_type = 'CLIENT'", origem: '0011' },
  {
    tabela: 'lgpd_requests',
    nome: 'lgpd_requests_request_type_check',
    validado: true,
    expressao: "request_type = ANY (ARRAY['ERASURE','EXPORT'])",
    origem: '0011',
  },
  {
    tabela: 'lgpd_requests',
    nome: 'lgpd_requests_status_check',
    validado: true,
    expressao:
      "status = ANY (ARRAY['RECEIVED','IDENTITY_VERIFIED','APPROVED','IN_PROGRESS','COMPLETED','DENIED','FAILED'])",
    origem: '0011',
  },

  // Invalidação de sessão depende de `access_token_version` monotônico.
  { tabela: 'usuarios', nome: 'usuarios_access_token_version_positive', validado: true, expressao: 'access_token_version > 0', origem: '0023' },

  // NOT VALID por decisão das migrations de origem (evitar full scan em
  // tabela com histórico). Escrita nova já é protegida.
  {
    tabela: 'itens_pedido',
    nome: 'itens_pedido_desconto_perc_range',
    validado: false,
    expressao: 'desconto_perc >= 0 AND desconto_perc <= 100',
    origem: '0024',
  },
  { tabela: 'itens_pedido', nome: 'itens_pedido_ipi_perc_range', validado: false, expressao: 'ipi_perc >= 0 AND ipi_perc <= 100', origem: '0024' },
  {
    tabela: 'pedidos',
    nome: 'pedidos_status_check',
    validado: false,
    expressao: "status = ANY (ARRAY['em_aberto','liberado','parcialmente_faturado','faturado','cancelado'])",
    origem: '0027',
  },
  {
    tabela: 'comissoes',
    nome: 'comissoes_status_check',
    validado: false,
    expressao: "status = ANY (ARRAY['pendente','faturado','pago'])",
    origem: '0029',
  },
];

/**
 * Índices únicos parciais = as únicas travas de unicidade de negócio que o
 * banco garante sob concorrência. Um CHECK não impede duas transações
 * simultâneas de inserir a mesma nota fiscal; este índice impede.
 * Todos são escopados por `tenant_id`: unicidade de negócio é sempre por
 * tenant, nunca global.
 */
const INDICES_PARCIAIS_ESPERADOS: IndiceParcialEsperado[] = [
  {
    tabela: 'notas_fiscais',
    colunas: ['tenant_id', 'pedido_id', 'numero_nota'],
    predicado: 'deleted_at IS NULL',
    regra: 'numero de nota nao se repete dentro do mesmo pedido (soft delete libera o numero)',
    origem: '0028',
  },
  {
    tabela: 'comissoes',
    colunas: ['tenant_id', 'nota_fiscal_id'],
    predicado: 'deleted_at IS NULL AND nota_fiscal_id IS NOT NULL',
    regra: 'uma comissao por nota fiscal (1:1)',
    origem: '0029',
  },
  {
    tabela: 'lgpd_requests',
    colunas: ['tenant_id', 'subject_type', 'subject_uuid', 'request_type'],
    predicado: "status <> ALL (ARRAY['COMPLETED','DENIED','FAILED'])",
    regra: 'no maximo uma solicitacao LGPD em aberto por titular/tipo (idempotencia)',
    origem: '0011',
  },
  {
    tabela: 'tenant_roles',
    colunas: ['tenant_id', 'name'],
    predicado: 'deleted_at IS NULL',
    regra: 'nome de perfil unico por tenant entre os ativos',
    origem: '0025',
  },
  {
    tabela: 'pedidos',
    colunas: ['tenant_id', 'numero_pedido'],
    predicado: 'numero_pedido IS NOT NULL',
    regra: 'numero_pedido unico por tenant',
    origem: '0000',
  },
];

/** Tabelas declaradas por migrations já marcadas como aplicadas. */
const TABELAS_ESPERADAS = [
  'clientes',
  'comissoes',
  'financeiro_movimentacao',
  'fornecedores',
  'inadimplencia',
  'itens_pedido',
  'lgpd_requests',
  'local_users',
  'mobile_sessions',
  'notas_fiscais',
  'parceiros_comerciais',
  'pedidos',
  'permissions',
  'pii_audit_events',
  'produtos',
  'refresh_tokens',
  'schema_migrations',
  'tenant_role_permissions',
  'tenant_roles',
  'transportadoras',
  'usuarios',
  // Infra de sync mobile (0008/0009). Ausente = push/pull do mobile quebra em runtime.
  'sync_outbox',
  'sync_changes',
  'sync_mutation_inbox',
];

const FUNCOES_ESPERADAS = [
  'set_updated_at', // 0020 — autoridade de updated_at
  'capture_sync_outbox', // 0008
  'drain_sync_outbox', // 0008
];

/**
 * Normaliza expressão SQL para comparar semântica, não formatação.
 * O `pg_get_constraintdef` devolve a forma reescrita pelo planner (`IN` vira
 * `= ANY (ARRAY[...])`, `BETWEEN` vira `>= AND <=`) e enche de casts e
 * parênteses. Sem normalizar, a comparação acusaria diferença onde não há.
 */
function normalizar(expressao: string): string {
  return expressao
    .replace(/::[a-z_]+(\s+[a-z_]+)*(\[\])?/gi, '') // casts: ::text, ::character varying, ::text[]
    .replace(/[()\s]/g, '')
    .toLowerCase();
}

type Problema = { categoria: string; detalhe: string };

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERRO: DATABASE_URL é obrigatória.');
    console.error('Uso: DATABASE_URL=postgresql://user:senha@host:porta/base npm run db:verify');
    return 2;
  }

  const client = new Client({ connectionString });
  await client.connect();

  const problemas: Problema[] = [];

  try {
    const versao = await client.query<{ server_version: string }>('SHOW server_version');
    const alvo = await client.query<{ db: string; host: string }>(
      'SELECT current_database() AS db, inet_server_addr()::text AS host',
    );
    console.log('='.repeat(78));
    console.log('db:verify — auditoria de drift de schema (somente leitura)');
    console.log(`banco: ${alvo.rows[0].db}  |  host: ${alvo.rows[0].host ?? 'local'}  |  PostgreSQL ${versao.rows[0].server_version}`);
    console.log('='.repeat(78));

    // ── Tabelas ──────────────────────────────────────────────────────────────
    const tabelas = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const tabelasPresentes = new Set(tabelas.rows.map((linha) => linha.tablename));

    console.log('\n[1/4] Tabelas');
    for (const tabela of TABELAS_ESPERADAS) {
      if (!tabelasPresentes.has(tabela)) {
        console.log(`  FALTANDO  ${tabela}`);
        problemas.push({ categoria: 'tabela', detalhe: tabela });
      }
    }
    console.log(`  ${TABELAS_ESPERADAS.length - problemas.length}/${TABELAS_ESPERADAS.length} presentes`);

    // ── CHECK constraints ────────────────────────────────────────────────────
    const checks = await client.query<{
      tabela: string;
      nome: string;
      validado: boolean;
      definicao: string;
    }>(`
      SELECT rel.relname AS tabela,
             con.conname AS nome,
             con.convalidated AS validado,
             pg_get_constraintdef(con.oid) AS definicao
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public' AND con.contype = 'c'
    `);
    const checksPresentes = new Map(checks.rows.map((linha) => [`${linha.tabela}.${linha.nome}`, linha]));

    console.log('\n[2/4] CHECK constraints');
    let checksOk = 0;
    for (const esperado of CHECKS_ESPERADOS) {
      const chave = `${esperado.tabela}.${esperado.nome}`;
      const encontrado = checksPresentes.get(chave);

      if (!encontrado) {
        console.log(`  FALTANDO    ${chave}  (migration ${esperado.origem})  ->  CHECK (${esperado.expressao})`);
        problemas.push({ categoria: 'check ausente', detalhe: chave });
        continue;
      }

      const definicaoNua = encontrado.definicao.replace(/^CHECK\s*/i, '').replace(/\s*NOT VALID$/i, '');
      if (normalizar(definicaoNua) !== normalizar(esperado.expressao)) {
        console.log(`  DIVERGENTE  ${chave}  (migration ${esperado.origem})`);
        console.log(`              esperado: ${esperado.expressao}`);
        console.log(`              no banco: ${definicaoNua}`);
        problemas.push({ categoria: 'check divergente', detalhe: chave });
        continue;
      }

      if (encontrado.validado !== esperado.validado) {
        const situacao = encontrado.validado ? 'validado' : 'NOT VALID';
        const alvoTexto = esperado.validado ? 'validado' : 'NOT VALID';
        console.log(`  DIVERGENTE  ${chave}: está ${situacao}, esperado ${alvoTexto}`);
        problemas.push({ categoria: 'check validade', detalhe: chave });
        continue;
      }

      checksOk += 1;
    }
    console.log(`  ${checksOk}/${CHECKS_ESPERADOS.length} conformes`);

    // ── Índices únicos parciais ──────────────────────────────────────────────
    const indices = await client.query<{
      tabela: string;
      indice: string;
      colunas: string[];
      predicado: string | null;
    }>(`
      SELECT rel.relname AS tabela,
             idx.relname AS indice,
             ARRAY(
               SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
               FROM generate_subscripts(ix.indkey, 1) AS k
               ORDER BY k
             ) AS colunas,
             pg_get_expr(ix.indpred, ix.indrelid) AS predicado
      FROM pg_index ix
      JOIN pg_class idx ON idx.oid = ix.indexrelid
      JOIN pg_class rel ON rel.oid = ix.indrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public' AND ix.indisunique AND ix.indpred IS NOT NULL
    `);

    console.log('\n[3/4] Índices únicos parciais (unicidade de negócio por tenant)');
    let indicesOk = 0;
    for (const esperado of INDICES_PARCIAIS_ESPERADOS) {
      const candidatos = indices.rows.filter(
        (linha) =>
          linha.tabela === esperado.tabela &&
          linha.colunas.length === esperado.colunas.length &&
          linha.colunas.every((coluna, posicao) => coluna === esperado.colunas[posicao]),
      );

      const rotulo = `${esperado.tabela}(${esperado.colunas.join(', ')})`;

      if (candidatos.length === 0) {
        console.log(`  FALTANDO    UNIQUE ${rotulo} WHERE ${esperado.predicado}`);
        console.log(`              regra: ${esperado.regra}  (migration ${esperado.origem})`);
        problemas.push({ categoria: 'indice unico parcial ausente', detalhe: rotulo });
        continue;
      }

      const compativel = candidatos.find(
        (linha) => normalizar(linha.predicado ?? '') === normalizar(esperado.predicado),
      );

      if (!compativel) {
        console.log(`  DIVERGENTE  UNIQUE ${rotulo}`);
        console.log(`              predicado esperado: ${esperado.predicado}`);
        console.log(`              predicado no banco: ${candidatos[0].predicado}`);
        problemas.push({ categoria: 'indice unico parcial divergente', detalhe: rotulo });
        continue;
      }

      indicesOk += 1;
    }
    console.log(`  ${indicesOk}/${INDICES_PARCIAIS_ESPERADOS.length} conformes`);

    // ── Funções e triggers ───────────────────────────────────────────────────
    const funcoes = await client.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
    );
    const funcoesPresentes = new Set(funcoes.rows.map((linha) => linha.proname));

    /**
     * Trigger conferido por FUNÇÃO alvo, não por nome: `notas_fiscais` usa
     * legitimamente `trg_notas_fiscais_updated_at` (0028) enquanto as demais
     * usam `trg_set_updated_at` (0020). O invariante é "existe trigger que
     * delega updated_at ao banco", não o nome dele.
     */
    const triggers = await client.query<{ tabela: string; tgname: string }>(`
      SELECT rel.relname AS tabela, t.tgname
      FROM pg_trigger t
      JOIN pg_class rel ON rel.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE ns.nspname = 'public' AND NOT t.tgisinternal AND p.proname = 'set_updated_at'
    `);
    const tabelasComTrigger = new Set(triggers.rows.map((linha) => linha.tabela));

    const comUpdatedAt = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'updated_at'
        AND data_type = 'timestamp with time zone'
      ORDER BY table_name
    `);

    console.log('\n[4/4] Funções e triggers de updated_at');
    for (const funcao of FUNCOES_ESPERADAS) {
      if (!funcoesPresentes.has(funcao)) {
        console.log(`  FALTANDO    função public.${funcao}()`);
        problemas.push({ categoria: 'funcao', detalhe: funcao });
      }
    }

    let triggersOk = 0;
    for (const linha of comUpdatedAt.rows) {
      if (!tabelasComTrigger.has(linha.table_name)) {
        console.log(`  FALTANDO    trigger set_updated_at em ${linha.table_name}`);
        problemas.push({ categoria: 'trigger updated_at', detalhe: linha.table_name });
        continue;
      }
      triggersOk += 1;
    }
    console.log(`  ${triggersOk}/${comUpdatedAt.rowCount ?? 0} tabelas com updated_at protegidas por trigger`);

    // ── Veredito ─────────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(78));
    if (problemas.length === 0) {
      console.log('OK: schema íntegro. Nenhum drift encontrado.');
      console.log('='.repeat(78));
      return 0;
    }

    console.log(`DRIFT: ${problemas.length} problema(s) encontrado(s).`);
    const porCategoria = new Map<string, number>();
    for (const problema of problemas) {
      porCategoria.set(problema.categoria, (porCategoria.get(problema.categoria) ?? 0) + 1);
    }
    for (const [categoria, total] of porCategoria) {
      console.log(`  ${total}x ${categoria}`);
    }
    console.log('\nNÃO faça deploy antes de resolver. Objetos ausentes NÃO voltam');
    console.log('sozinhos: `schema_migrations` já marca as migrations como aplicadas.');
    console.log('='.repeat(78));
    return 1;
  } finally {
    await client.end();
  }
}

main()
  .then((codigo) => {
    process.exit(codigo);
  })
  .catch((erro: unknown) => {
    console.error('db:verify falhou:', erro);
    process.exit(2);
  });
