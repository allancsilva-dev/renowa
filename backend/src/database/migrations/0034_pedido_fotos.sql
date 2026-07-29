-- Fotos do pedido: imagens anexadas ao pedido (avaria, amostra, conferência)
-- que aparecem no papel impresso. Quando o nome do arquivo bate com o código
-- de um item, a foto é vinculada automaticamente àquele item.
--
-- Storage em `bytea` no próprio Postgres, e não em bucket externo, porque:
-- (a) o repo não tem nenhuma infra de binário hoje — bucket significaria
--     credencial, CORS, lifecycle e um caminho de expurgo próprio;
-- (b) a foto entra no mesmo backup e na mesma transação do pedido que ela
--     documenta, então soft delete e purga LGPD já a cobrem sem job externo;
-- (c) `bytea` grande vai para TOAST fora da heap — não pesa nas listagens.
-- As colunas `storage_backend`/`storage_key` deixam a porta aberta para migrar
-- para bucket depois sem migrar dado: linhas novas passam a nascer com 'r2' e
-- as antigas continuam válidas em 'db'.
--
-- Mesmo esqueleto de VersionedBaseEntity das demais tabelas (0028).
CREATE TABLE IF NOT EXISTS public.pedido_fotos (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  pedido_id int NOT NULL,
  -- NULL = foto do pedido como um todo (nome do arquivo não bateu com item).
  item_pedido_id int,
  nome_arquivo varchar NOT NULL,
  -- Código extraído do nome do arquivo; mantido para auditar o auto-vínculo.
  codigo_vinculo varchar,
  mime_type varchar NOT NULL,
  tamanho_bytes int NOT NULL,
  storage_backend varchar NOT NULL DEFAULT 'db',
  conteudo bytea,
  storage_key varchar,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- Whitelist de formato. SVG fica de fora de propósito: é XML executável e
-- servi-lo inline é vetor de XSS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_fotos_mime_type_check') THEN
    ALTER TABLE public.pedido_fotos
      ADD CONSTRAINT pedido_fotos_mime_type_check
      CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));
  END IF;
END $$;

-- Teto de 3 MB por foto. O cliente já reduz a imagem antes de enviar; este
-- CHECK é a última linha de defesa contra um upload direto na API.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_fotos_tamanho_bytes_check') THEN
    ALTER TABLE public.pedido_fotos
      ADD CONSTRAINT pedido_fotos_tamanho_bytes_check
      CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 3145728);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_fotos_storage_backend_check') THEN
    ALTER TABLE public.pedido_fotos
      ADD CONSTRAINT pedido_fotos_storage_backend_check
      CHECK (storage_backend IN ('db', 'r2'));
  END IF;
END $$;

-- Exatamente um destino preenchido, coerente com o backend declarado. Sem
-- isto, uma linha 'db' sem `conteudo` vira foto fantasma: aparece na listagem
-- e falha só na hora de montar o PDF.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_fotos_storage_check') THEN
    ALTER TABLE public.pedido_fotos
      ADD CONSTRAINT pedido_fotos_storage_check
      CHECK (
        (storage_backend = 'db' AND conteudo IS NOT NULL AND storage_key IS NULL)
        OR
        (storage_backend = 'r2' AND storage_key IS NOT NULL AND conteudo IS NULL)
      );
  END IF;
END $$;

-- Índices únicos (tenant_id,id)/(tenant_id,uuid): obrigatórios em toda tabela
-- nova (padrão de 0021_cross_tenant_foreign_keys.sql); (tenant_id,id) também é
-- o alvo exigido pelas FKs compostas de tenant abaixo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_fotos_tenant_id_id
  ON public.pedido_fotos (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedido_fotos_tenant_id_uuid
  ON public.pedido_fotos (tenant_id, uuid);

CREATE INDEX IF NOT EXISTS idx_pedido_fotos_tenant_pedido
  ON public.pedido_fotos (tenant_id, pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_fotos_tenant_updated
  ON public.pedido_fotos (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pedido_fotos_tenant_deleted
  ON public.pedido_fotos (tenant_id, deleted_at);

-- Tabela nova e vazia: as FKs podem nascer já validadas (sem custo de scan em
-- dado legado). Mesma forma de FK composta tenant usada em 0021/0028 — é ela
-- que torna impossível apontar a foto para o pedido de outro tenant.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedido_fotos_tenant_pedido') THEN
    ALTER TABLE public.pedido_fotos
      ADD CONSTRAINT fk_pedido_fotos_tenant_pedido
      FOREIGN KEY (tenant_id, pedido_id) REFERENCES public.pedidos (tenant_id, id);
  END IF;
END $$;

-- `itens_pedido` é anterior ao padrão de 0021 e só tem UNIQUE(tenant_id,uuid);
-- sem UNIQUE(tenant_id,id) o PostgreSQL recusa a FK composta abaixo
-- ("there is no unique constraint matching given keys"). O índice é redundante
-- do ponto de vista de unicidade (`id` já é PK), mas é o alvo que a FK exige —
-- e alinha a tabela com o invariante que toda tabela nova já segue.
CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_pedido_tenant_id_id
  ON public.itens_pedido (tenant_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedido_fotos_tenant_item') THEN
    ALTER TABLE public.pedido_fotos
      ADD CONSTRAINT fk_pedido_fotos_tenant_item
      FOREIGN KEY (tenant_id, item_pedido_id) REFERENCES public.itens_pedido (tenant_id, id);
  END IF;
END $$;

-- updated_at é autoridade exclusiva do PostgreSQL (contrato de
-- 0020_utc_timestamps_db_authority.sql) — precisa do mesmo trigger que todas
-- as demais tabelas com essa coluna já têm. CREATE OR REPLACE é defensivo e
-- idempotente (função idêntica à de 0020): não assume que o efeito de runtime
-- de uma migration anterior já marcada como aplicada ainda esteja no banco.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pedido_fotos_updated_at ON public.pedido_fotos;
CREATE TRIGGER trg_pedido_fotos_updated_at
  BEFORE INSERT OR UPDATE ON public.pedido_fotos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
