-- Pedido externo: pedido digitado em sistema de terceiro, registrado aqui com
-- fornecedor e cliente cadastrados, mas sem itens — só número do pedido no
-- sistema de origem, nome desse sistema e o valor total.
--
-- Fica na MESMA tabela `pedidos` (e consome a MESMA `pedidos_numero_seq`) de
-- propósito: assim herda sem duplicação o ciclo de vida inteiro que já existe
-- — liberar, fila de faturamento, nota fiscal 1:N, recálculo de status,
-- comissão, cancelamento, soft delete e permissões.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origem varchar NOT NULL DEFAULT 'interno';

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero_pedido_externo varchar;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS sistema_origem varchar;

-- PostgreSQL não suporta "ADD CONSTRAINT IF NOT EXISTS" (só ADD COLUMN aceita
-- essa cláusula) — idempotência via checagem manual em pg_constraint, mesmo
-- padrão de 0021_cross_tenant_foreign_keys.sql e 0027_order_status_lifecycle.sql.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_origem_check') THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_origem_check
      CHECK (origem IN ('interno', 'externo'))
      NOT VALID;
  END IF;
END $$;

-- A forma do pedido depende da origem, e isso precisa valer no banco e não só
-- no DTO: pedido externo SEM valor entraria na fila de faturamento com
-- divergência igual ao total da nota (FaturamentoService lê
-- `total_com_imposto ?? total_sem_imposto`), e pedido interno COM campos de
-- origem externa preenchidos mentiria na listagem e no papel impresso.
--
-- NOT VALID: as linhas legadas são todas 'interno' com as duas colunas novas
-- NULL (DEFAULT + ADD COLUMN), então já satisfazem o CHECK; o NOT VALID evita
-- o full scan de validação agora, mesmo padrão de 0027. Escritas novas já
-- são barradas imediatamente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_origem_externa_check') THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_origem_externa_check
      CHECK (
        (origem = 'externo'
          AND numero_pedido_externo IS NOT NULL
          AND sistema_origem IS NOT NULL
          AND total_com_imposto IS NOT NULL)
        OR
        (origem = 'interno'
          AND numero_pedido_externo IS NULL
          AND sistema_origem IS NULL)
      )
      NOT VALID;
  END IF;
END $$;

-- Filtro de origem na listagem de pedidos (GET /pedidos?origem=).
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_origem
  ON public.pedidos (tenant_id, origem);
