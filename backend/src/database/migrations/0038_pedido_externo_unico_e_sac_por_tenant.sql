-- Duas invariantes de negócio pedidas pelo usuário na revisão de 2026-07-29.
--
-- (1) Pedido externo duplicado. `createExternal` não checava nada e não havia
-- índice: o mesmo pedido do sistema de terceiro podia ser registrado N vezes,
-- cada vez consumindo um `numero_pedido` novo e gerando fila de faturamento e
-- comissão duplicadas. É o erro de digitação mais provável da feature.
--
-- A chave é (tenant, fornecedor, número), NÃO (tenant, sistema, número):
-- `sistema_origem` é texto livre digitado pelo operador ("SAP B1" / "SapB1" /
-- "sap b1") e como chave deixaria passar exatamente a duplicata que se quer
-- barrar. O mesmo número em fornecedores distintos é legítimo.
--
-- Índice PARCIAL por dois motivos: `origem = 'externo'` porque pedido interno tem
-- `numero_pedido_externo` NULL por CHECK (0033) e NULLs não colidem, mas o
-- predicado deixa a intenção explícita; `deleted_at IS NULL` porque o pedido
-- excluído (soft delete) não deve reservar o número para sempre — corrigir um
-- lançamento errado é excluir e refazer. Mesmo padrão de
-- `uq_chamados_sac_tenant_numero_active` (0035).
--
-- (2) Numeração do SAC por tenant. `sac_numero_seq` é uma sequence GLOBAL: o
-- tenant A enxergava #1, #4, #9, e os buracos revelavam o volume de chamados dos
-- outros tenants. Decisão do usuário: 1, 2, 3 por tenant.
--
-- Mecanismo: tabela de contador com UPSERT atômico, não sequence por tenant
-- (exigiria DDL dinâmico a cada tenant novo) nem MAX+1 (corrida clássica). O
-- `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` é uma instrução só e trava
-- apenas a linha do próprio tenant, então dois tenants nunca se serializam entre
-- si. O buraco por rollback continua existindo, exatamente como no pedido: o
-- número é consumido antes do COMMIT.
--
-- Chamados existentes NÃO são renumerados. Número já emitido pode ter sido
-- impresso no papel do chamado, e reescrever histórico para fechar buraco é pior
-- que o buraco. O contador é semeado no MAX de cada tenant, então a numeração
-- contínua começa a valer dos chamados novos em diante.
--
-- `sac_numero_seq` fica no banco, sem uso. Dropar sequence é irreversível e não
-- traz benefício; deixá-la também mantém `db:migrate` reaplicável em banco que já
-- passou pela 0035.
--
-- Segurança de aplicação: se houver pedido externo duplicado em qualquer
-- ambiente, o CREATE UNIQUE INDEX falha e a migration para — é o comportamento
-- desejado, porque a resolução é decisão de negócio, não de schema. Conferir
-- ANTES de aplicar em produção:
--   SELECT tenant_id, fornecedor_id, numero_pedido_externo, count(*)
--     FROM public.pedidos
--    WHERE origem = 'externo' AND deleted_at IS NULL
--    GROUP BY 1, 2, 3 HAVING count(*) > 1;

-- ── (1) Pedido externo único por fornecedor ─────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_externo_numero
  ON public.pedidos (tenant_id, fornecedor_id, numero_pedido_externo)
  WHERE origem = 'externo' AND deleted_at IS NULL;

-- ── (2) Contador de chamados SAC por tenant ─────────────────────────────────
-- `tenant_id` como PRIMARY KEY já é o índice único exigido pelo invariante de
-- isolamento verificado em db:verify [6/6]; a tabela é um contador, não tem
-- identidade própria além do tenant, e por isso não tem `id` nem soft delete.
CREATE TABLE IF NOT EXISTS public.sac_numero_contador (
  tenant_id  uuid PRIMARY KEY,
  ultimo     int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sac_numero_contador_ultimo_check'
  ) THEN
    ALTER TABLE public.sac_numero_contador
      ADD CONSTRAINT sac_numero_contador_ultimo_check CHECK (ultimo >= 0);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_sac_numero_contador_updated_at ON public.sac_numero_contador;
CREATE TRIGGER trg_sac_numero_contador_updated_at
  BEFORE INSERT OR UPDATE ON public.sac_numero_contador
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Semeadura: parte do maior número já emitido em cada tenant, inclusive os
-- soft-deleted — número de chamado excluído não volta a circular.
INSERT INTO public.sac_numero_contador (tenant_id, ultimo)
SELECT tenant_id, MAX(numero_chamado)
  FROM public.chamados_sac
 GROUP BY tenant_id
ON CONFLICT (tenant_id) DO UPDATE
  SET ultimo = GREATEST(public.sac_numero_contador.ultimo, EXCLUDED.ultimo);
