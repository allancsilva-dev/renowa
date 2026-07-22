-- PROB-0059 / PROB-0060: restauração das invariantes de schema apagadas pelo
-- `synchronize` do TypeORM.
--
-- CONTEXTO
-- O bootstrap do TypeORM rodava com `synchronize` ligado fora de produção.
-- O synchronize reconcilia o banco contra os metadados das entities e remove
-- tudo que não está declarado nelas: CHECK constraints, índices únicos
-- parciais e triggers. Resultado observado no banco de desenvolvimento:
--   * ZERO CHECK constraints no schema `public` (as migrations declaram 20);
--   * os índices únicos parciais de 0011/0028/0029 sumiram;
--   * os triggers `trg_set_updated_at` de 0020 sumiram de todas as tabelas
--     (só sobreviveu `trg_notas_fiscais_updated_at`, recriado por 0028).
-- As migrations 0000..0030 continuam marcadas como aplicadas em
-- `schema_migrations`, então o efeito delas NÃO volta sozinho: precisa desta
-- migration de reparo.
--
-- IDEMPOTENTE POR DESIGN
-- Esta migration roda também em produção, onde não se sabe quais objetos
-- sobreviveram. Todo comando é guardado:
--   * CHECK  -> `pg_constraint` por (schema, tabela, conname). PostgreSQL não
--               aceita `ADD CONSTRAINT IF NOT EXISTS`; mesmo padrão de 0021.
--   * ÍNDICE -> `CREATE UNIQUE INDEX IF NOT EXISTS`.
--   * TRIGGER-> `pg_trigger`, por FUNÇÃO alvo e não por nome (ver bloco 3).
-- Reexecutar este arquivo é no-op. Nada aqui é destrutivo: só cria objeto
-- ausente. Nenhum DROP, nenhum UPDATE de dado.
--
-- SEMÂNTICA PRESERVADA (NOT VALID vs validado)
-- Cada constraint é recriada com a MESMA validade do arquivo original. As de
-- 0024/0027/0029 nasceram `NOT VALID` de propósito (evitar full scan e travar
-- tabela com histórico) e continuam `NOT VALID` aqui — `NOT VALID` já protege
-- toda escrita nova. Promover para validado é decisão separada, com janela
-- própria, não pode ser efeito colateral de um reparo.
--
-- FORA DE ESCOPO (drift real, deliberadamente NÃO tratado aqui)
--   * As FKs compostas de 0028/0029 existem, porém RENOMEADAS pelo
--     synchronize (`fk_notas_fiscais_tenant_pedido` -> `FK_183ff047...`).
--     O par de colunas (tenant_id, ...) foi preservado, o isolamento tenant
--     está intacto; recriar aqui geraria FK DUPLICADA. Só renomear é churn
--     sem ganho de integridade.
--   * Índices NÃO únicos recriados pelo synchronize como `IDX_*` com as
--     mesmas colunas: equivalentes, sem ação.
--   * Tabelas/funções/triggers de sync de 0008/0009 (`sync_outbox`,
--     `sync_changes`, `sync_mutation_inbox`, `capture_sync_outbox()`,
--     `drain_sync_outbox()`, `sync_change_revision_seq`): AUSENTES no banco de
--     dev. Recriar significa religar trigger de escrita em 6 tabelas quentes —
--     decisão de comportamento, não reparo de invariante. Reportado à parte.

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloco 1 — CHECK constraints (20)
-- Nomes: os mesmos que o PostgreSQL geraria numa base nova. Onde a migration
-- original declarou o CHECK inline no `ADD COLUMN` (0007/0009/0010/0011/0028),
-- o nome implícito é `<tabela>_<coluna>_check` — verificado no catálogo. Assim
-- uma base reparada e uma base criada do zero convergem para o mesmo nome, e o
-- `db:verify` precisa de uma única lista esperada.
-- Escopo do guard: (schema, tabela, conname). `conname` só é único por tabela,
-- então a checagem global usada em 0021/0027/0029 é frouxa demais.
-- ─────────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE
  alvo record;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      -- 0007_optimistic_concurrency.sql — validado na origem
      ('pedidos',                 'pedidos_version_check',                    $chk$version > 0$chk$,                    true),
      ('financeiro_movimentacao', 'financeiro_movimentacao_version_check',    $chk$version > 0$chk$,                    true),
      ('comissoes',               'comissoes_version_check',                  $chk$version > 0$chk$,                    true),
      ('parceiros_comerciais',    'parceiros_comerciais_version_check',       $chk$version > 0$chk$,                    true),
      ('inadimplencia',           'inadimplencia_version_check',              $chk$version > 0$chk$,                    true),

      -- 0009_sync_push_v2.sql — mesmo CHECK, entidades sincronizadas
      ('clientes',                'clientes_version_check',                   $chk$version > 0$chk$,                    true),
      ('produtos',                'produtos_version_check',                   $chk$version > 0$chk$,                    true),
      ('fornecedores',            'fornecedores_version_check',               $chk$version > 0$chk$,                    true),
      ('transportadoras',         'transportadoras_version_check',            $chk$version > 0$chk$,                    true),
      ('itens_pedido',            'itens_pedido_version_check',               $chk$version > 0$chk$,                    true),

      -- 0028_notas_fiscais.sql
      ('notas_fiscais',           'notas_fiscais_version_check',              $chk$version > 0$chk$,                    true),

      -- 0010_lgpd_audit.sql
      ('pii_audit_events',        'pii_audit_events_action_check',
        $chk$action IN ('READ','CREATE','UPDATE','DELETE','EXPORT','AUDIT_READ')$chk$,                                  true),

      -- 0011_lgpd_requests.sql
      ('lgpd_requests',           'lgpd_requests_subject_type_check',
        $chk$subject_type IN ('CLIENT')$chk$,                                                                           true),
      ('lgpd_requests',           'lgpd_requests_request_type_check',
        $chk$request_type IN ('ERASURE','EXPORT')$chk$,                                                                 true),
      ('lgpd_requests',           'lgpd_requests_status_check',
        $chk$status IN ('RECEIVED','IDENTITY_VERIFIED','APPROVED','IN_PROGRESS','COMPLETED','DENIED','FAILED')$chk$,    true),

      -- 0023_native_access_token_version.sql — nome explícito na origem
      ('usuarios',                'usuarios_access_token_version_positive',   $chk$access_token_version > 0$chk$,       true),

      -- 0024_order_calculation_contract.sql — NOT VALID na origem
      ('itens_pedido',            'itens_pedido_desconto_perc_range',
        $chk$desconto_perc BETWEEN 0 AND 100$chk$,                                                                      false),
      ('itens_pedido',            'itens_pedido_ipi_perc_range',
        $chk$ipi_perc BETWEEN 0 AND 100$chk$,                                                                           false),

      -- 0027_order_status_lifecycle.sql — NOT VALID na origem
      ('pedidos',                 'pedidos_status_check',
        $chk$status IN ('em_aberto', 'liberado', 'parcialmente_faturado', 'faturado', 'cancelado')$chk$,                 false),

      -- 0029_commission_pedido_nota_link.sql — NOT VALID na origem
      ('comissoes',               'comissoes_status_check',
        $chk$status IN ('pendente', 'faturado', 'pago')$chk$,                                                           false)
    ) AS t(tabela, nome, expressao, validado)
  LOOP
    -- Tabela ausente é drift grave, mas abortar aqui derruba o boot da API em
    -- produção (runMigrations roda antes do NestFactory). Pula e registra: o
    -- `db:verify` é o portão que falha alto sobre isso.
    IF to_regclass('public.' || quote_ident(alvo.tabela)) IS NULL THEN
      RAISE NOTICE '0031: tabela public.% ausente, CHECK % ignorado', alvo.tabela, alvo.nome;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class rel ON rel.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = alvo.tabela
        AND c.conname = alvo.nome
        AND c.contype = 'c'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s)%s',
      alvo.tabela,
      alvo.nome,
      alvo.expressao,
      CASE WHEN alvo.validado THEN '' ELSE ' NOT VALID' END
    );
    RAISE NOTICE '0031: CHECK % criado em public.%', alvo.nome, alvo.tabela;
  END LOOP;
END
$do$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloco 2 — Índices únicos parciais (regra de negócio, não performance)
-- São os únicos objetos deste arquivo que impedem gravação de dado inválido
-- por concorrência: um CHECK não protege contra duas transações simultâneas
-- inserindo a mesma nota. O synchronize apagou os três porque nenhum deles é
-- expressável nos metadados das entities (todos têm cláusula WHERE).
-- Cada um é `UNIQUE` já por tenant — sem eles, a unicidade de negócio não
-- existe no banco, só na aplicação.
-- ─────────────────────────────────────────────────────────────────────────────

-- 0028: nota fiscal não se repete dentro do mesmo pedido.
-- Parcial em `deleted_at IS NULL`: soft delete precisa liberar o número para
-- reemissão sem colidir com o histórico.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_tenant_pedido_numero_active
  ON public.notas_fiscais (tenant_id, pedido_id, numero_nota)
  WHERE deleted_at IS NULL;

-- 0029: uma comissão por nota fiscal (1:1). Ignora `nota_fiscal_id IS NULL`
-- (comissões legadas, lançadas antes do vínculo com nota) e linhas removidas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_tenant_nota_fiscal_active
  ON public.comissoes (tenant_id, nota_fiscal_id)
  WHERE deleted_at IS NULL AND nota_fiscal_id IS NOT NULL;

-- 0011: idempotência da state machine de LGPD — no máximo uma solicitação em
-- aberto por (titular, tipo). Sem este índice, dois cliques em "solicitar
-- exclusão" criam duas solicitações concorrentes de ERASURE para o mesmo
-- titular. NÃO estava na lista original de reparo, mas é drift da mesma
-- natureza (índice único parcial declarado numa migration já aplicada e
-- removido pelo synchronize) e a definição é cópia literal de 0011:25-27.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lgpd_active_request
  ON public.lgpd_requests (tenant_id, subject_type, subject_uuid, request_type)
  WHERE status NOT IN ('COMPLETED','DENIED','FAILED');

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloco 3 — PROB-0060: triggers de `updated_at`
-- Contrato de 0020: o PostgreSQL é autoridade EXCLUSIVA de `updated_at`.
-- Isso sustenta o sync incremental (cursor por `updated_at`) — com o trigger
-- ausente, `updated_at` passa a vir do relógio do processo Node, e qualquer
-- desvio de clock fura a janela do cursor: alteração fica invisível para o
-- mobile ou é reenviada indefinidamente.
--
-- A função é recriada com CREATE OR REPLACE (mesmo corpo de 0020/0028): esta
-- migration não pode depender do efeito runtime de migration anterior já
-- marcada como aplicada — foi exatamente essa premissa que o PROB-0059 quebrou.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

-- Diferença INTENCIONAL frente ao bloco de 0020 (linhas 41-80): lá o loop faz
-- DROP de qualquer trigger que use `set_updated_at` e recria como
-- `trg_set_updated_at`. Aqui o guard é por FUNÇÃO e o DROP não existe.
-- Motivo: `notas_fiscais` legitimamente usa o nome `trg_notas_fiscais_updated_at`
-- (0028 rodou depois de 0020, numa base nova). Copiar 0020 ao pé da letra
-- renomearia esse trigger e faria a base reparada DIVERGIR de uma base criada
-- do zero. Guardando por função: quem já tem trigger equivalente fica como
-- está, quem não tem recebe `trg_set_updated_at`. Idempotente e convergente.
DO $do$
DECLARE
  tabela record;
BEGIN
  FOR tabela IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.data_type = 'timestamp with time zone'
    ORDER BY c.table_name
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class rel ON rel.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_proc proc ON proc.oid = t.tgfoid
      WHERE ns.nspname = tabela.table_schema
        AND rel.relname = tabela.table_name
        AND proc.proname = 'set_updated_at'
        AND NOT t.tgisinternal
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      tabela.table_schema,
      tabela.table_name
    );
    RAISE NOTICE '0031: trigger trg_set_updated_at criado em %.%', tabela.table_schema, tabela.table_name;
  END LOOP;
END
$do$;
