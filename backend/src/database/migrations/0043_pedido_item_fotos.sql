-- Foto específica de uma linha do pedido. Não altera a foto do catálogo.
CREATE TABLE IF NOT EXISTS public.pedido_item_fotos (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  pedido_id int NOT NULL,
  item_pedido_id int NOT NULL,
  nome_arquivo varchar NOT NULL,
  mime_type varchar NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  tamanho_bytes int NOT NULL CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 3145728),
  conteudo bytea,
  storage_backend varchar NOT NULL DEFAULT 'db' CHECK (storage_backend IN ('db', 'purgado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT pedido_item_fotos_storage_check CHECK (
    (storage_backend = 'db' AND conteudo IS NOT NULL) OR
    (storage_backend = 'purgado' AND conteudo IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_item_fotos_tenant_id_id
  ON public.pedido_item_fotos (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_item_fotos_tenant_id_uuid
  ON public.pedido_item_fotos (tenant_id, uuid);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_item_fotos_item
  ON public.pedido_item_fotos (tenant_id, item_pedido_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pedido_item_fotos_tenant_updated
  ON public.pedido_item_fotos (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pedido_item_fotos_tenant_deleted
  ON public.pedido_item_fotos (tenant_id, deleted_at);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedido_item_fotos_tenant_pedido') THEN
    ALTER TABLE public.pedido_item_fotos ADD CONSTRAINT fk_pedido_item_fotos_tenant_pedido
      FOREIGN KEY (tenant_id, pedido_id) REFERENCES public.pedidos (tenant_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedido_item_fotos_tenant_item') THEN
    ALTER TABLE public.pedido_item_fotos ADD CONSTRAINT fk_pedido_item_fotos_tenant_item
      FOREIGN KEY (tenant_id, item_pedido_id) REFERENCES public.itens_pedido (tenant_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_pedido_item_fotos_updated_at ON public.pedido_item_fotos;
CREATE TRIGGER trg_pedido_item_fotos_updated_at
  BEFORE INSERT OR UPDATE ON public.pedido_item_fotos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

