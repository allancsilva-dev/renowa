CREATE SEQUENCE IF NOT EXISTS public.sync_change_revision_seq AS bigint;

CREATE TABLE IF NOT EXISTS public.sync_outbox (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  entity text NOT NULL CHECK (entity IN ('clientes','produtos','fornecedores','transportadoras','pedidos','itens_pedido')),
  entity_uuid uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('UPSERT','DELETE')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_tenant_entity_id
  ON public.sync_outbox (tenant_id, entity, id);

CREATE TABLE IF NOT EXISTS public.sync_changes (
  revision bigint PRIMARY KEY DEFAULT nextval('public.sync_change_revision_seq'),
  tenant_id uuid NOT NULL,
  entity text NOT NULL,
  entity_uuid uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('UPSERT','DELETE')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_tenant_entity_revision
  ON public.sync_changes (tenant_id, entity, revision);

CREATE OR REPLACE FUNCTION public.capture_sync_outbox() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  entity_name text := TG_TABLE_NAME;
  operation_name text;
BEGIN
  operation_name := CASE WHEN NEW.deleted_at IS NOT NULL THEN 'DELETE' ELSE 'UPSERT' END;
  row_data := row_data - 'id' - 'created_at';

  IF entity_name = 'clientes' THEN
    row_data := row_data - 'transportadora_id' || jsonb_build_object(
      'transportadora_uuid', (SELECT uuid FROM public.transportadoras WHERE id = NEW.transportadora_id));
  ELSIF entity_name = 'produtos' THEN
    row_data := row_data - 'fornecedor_id' || jsonb_build_object(
      'fornecedor_uuid', (SELECT uuid FROM public.fornecedores WHERE id = NEW.fornecedor_id));
  ELSIF entity_name = 'pedidos' THEN
    row_data := row_data - 'cliente_id' - 'vendedor_id' - 'fornecedor_id' - 'transportadora_id'
      || jsonb_build_object(
        'cliente_uuid', (SELECT uuid FROM public.clientes WHERE id = NEW.cliente_id),
        'vendedor_uuid', (SELECT uuid FROM public.usuarios WHERE id = NEW.vendedor_id),
        'fornecedor_uuid', (SELECT uuid FROM public.fornecedores WHERE id = NEW.fornecedor_id),
        'transportadora_uuid', (SELECT uuid FROM public.transportadoras WHERE id = NEW.transportadora_id));
  ELSIF entity_name = 'itens_pedido' THEN
    row_data := row_data - 'pedido_id' - 'produto_id' || jsonb_build_object(
      'pedido_uuid', (SELECT uuid FROM public.pedidos WHERE id = NEW.pedido_id),
      'produto_uuid', (SELECT uuid FROM public.produtos WHERE id = NEW.produto_id));
  END IF;

  INSERT INTO public.sync_outbox (tenant_id, entity, entity_uuid, operation, payload)
  VALUES (NEW.tenant_id, entity_name, NEW.uuid, operation_name, row_data);
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['clientes','produtos','fornecedores','transportadoras','pedidos','itens_pedido']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_sync_outbox ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_sync_outbox AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.capture_sync_outbox()',
      table_name, table_name);
  END LOOP;
END $$;

-- Advisory xact lock serializa drenagens. Revisions só nascem de rows já visíveis,
-- portanto nenhuma transação longa reserva cursor antes do próprio commit.
CREATE OR REPLACE FUNCTION public.drain_sync_outbox() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE drained integer;
BEGIN
  PERFORM pg_advisory_xact_lock(1984060913);
  WITH moved AS (
    DELETE FROM public.sync_outbox
    WHERE id IN (SELECT id FROM public.sync_outbox ORDER BY id FOR UPDATE)
    RETURNING tenant_id, entity, entity_uuid, operation, payload, created_at
  ), inserted AS (
    INSERT INTO public.sync_changes (tenant_id, entity, entity_uuid, operation, payload, created_at)
    SELECT tenant_id, entity, entity_uuid, operation, payload, created_at FROM moved
    ORDER BY created_at
    RETURNING 1
  )
  SELECT count(*) INTO drained FROM inserted;
  RETURN drained;
END;
$$;
