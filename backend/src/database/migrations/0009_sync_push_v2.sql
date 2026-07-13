-- Push v2: optimistic concurrency for every synced entity and durable idempotency.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clientes','produtos','fornecedores','transportadoras','pedidos','itens_pedido'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1 CHECK (version > 0)',
      table_name
    );
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.sync_mutation_inbox (
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  sync_run_id uuid,
  entity text NOT NULL CHECK (entity IN ('clientes','produtos','fornecedores','transportadoras','pedidos','itens_pedido')),
  entity_uuid uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, device_id, operation_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_mutation_inbox_created_at
  ON public.sync_mutation_inbox (created_at);

COMMENT ON TABLE public.sync_mutation_inbox IS
  'Resultados terminais do push v2. Retenção deve superar a janela máxima de retry dos clientes.';
