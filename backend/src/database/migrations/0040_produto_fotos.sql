-- Foto do PRODUTO, e fim da foto do pedido.
--
-- A 0034 pendurou a foto no pedido e a 0039 acrescentou a escolha de qual foto
-- de cada item ia ao papel. O papel impresso está certo — uma foto por linha de
-- item —, mas a origem estava errada: a foto é atributo do PRODUTO, cadastrada
-- uma vez no catálogo, e todo pedido que use aquele produto imprime a mesma
-- imagem. Uma foto por produto, então some toda a máquina de "várias fotos,
-- escolha uma": vínculo por nome de arquivo (`codigo_vinculo`), `usar_no_papel`,
-- revinculação manual e teto de 10 por pedido.
--
-- `produto_fotos` é tabela SEPARADA, e não colunas em `produtos`, porque
-- `produtos` é entidade de sync: o trigger de 0008 serializa a linha inteira com
-- `to_jsonb(NEW)` no change feed, e um `bytea` ali viraria base64 no payload de
-- todo pull do mobile. A tabela separada também mantém o binário fora de
-- qualquer listagem de catálogo.
--
-- Storage segue em `bytea` no Postgres pelos mesmos motivos da 0034 (sem infra
-- de bucket, mesmo backup e mesma transação, TOAST fora da heap), com
-- `storage_backend`/`storage_key` deixando a porta aberta para migrar depois.
--
-- ── Perda de dado, deliberada ───────────────────────────────────────────────
-- O DROP no fim é irreversível. Some: foto solta (sem item), foto de item
-- manual (`produto_id IS NULL` — não há produto onde pendurá-la) e foto de
-- pedido externo (o papel do externo não tem tabela de itens). Decisão do
-- usuário. FAÇA DUMP ANTES DE APLICAR EM PRODUÇÃO.
--
-- Conferência antes de aplicar — a segunda contagem é o que se perde:
--   SELECT count(*) FROM pedido_fotos WHERE deleted_at IS NULL;
--   SELECT count(*) FROM pedido_fotos f
--     LEFT JOIN itens_pedido i ON i.id = f.item_pedido_id AND i.tenant_id = f.tenant_id
--    WHERE f.deleted_at IS NULL AND (i.id IS NULL OR i.produto_id IS NULL);
-- Depois de aplicar, o destino:
--   SELECT count(*) FROM produto_fotos WHERE deleted_at IS NULL;

-- ── (1) Tabela ──────────────────────────────────────────────────────────────
-- Mesmo esqueleto de VersionedBaseEntity das demais tabelas (0028).
CREATE TABLE IF NOT EXISTS public.produto_fotos (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  produto_id int NOT NULL,
  -- Preenchido SÓ pela migração abaixo. Foto migrada veio de um pedido e pode
  -- carregar documento de cliente no pixel (nota fiscal traz nome, CNPJ e
  -- endereço); é por esta coluna que o ERASURE da LGPD continua alcançando-a,
  -- do mesmo jeito que alcançava `pedido_fotos`. Foto nova de catálogo nasce
  -- NULL e fica fora do expurgo por cliente — ela não pertence a cliente nenhum.
  origem_pedido_id int,
  nome_arquivo varchar NOT NULL,
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

-- ── (2) CHECKs, espelhados da 0034 + 0037 ───────────────────────────────────
-- Whitelist de formato. SVG fica de fora de propósito: é XML executável e
-- servi-lo inline é vetor de XSS.
ALTER TABLE public.produto_fotos
  DROP CONSTRAINT IF EXISTS produto_fotos_mime_type_check;
ALTER TABLE public.produto_fotos
  ADD CONSTRAINT produto_fotos_mime_type_check
  CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'));

-- Teto de 3 MB por foto. O cliente já reduz a imagem antes de enviar; este
-- CHECK é a última linha de defesa contra um upload direto na API.
ALTER TABLE public.produto_fotos
  DROP CONSTRAINT IF EXISTS produto_fotos_tamanho_bytes_check;
ALTER TABLE public.produto_fotos
  ADD CONSTRAINT produto_fotos_tamanho_bytes_check
  CHECK (tamanho_bytes > 0 AND tamanho_bytes <= 3145728);

-- `purgado` já nasce aqui (0037): o ERASURE precisa de um estado em que nem
-- `conteudo` nem `storage_key` estão preenchidos.
ALTER TABLE public.produto_fotos
  DROP CONSTRAINT IF EXISTS produto_fotos_storage_backend_check;
ALTER TABLE public.produto_fotos
  ADD CONSTRAINT produto_fotos_storage_backend_check
  CHECK (storage_backend IN ('db', 'r2', 'purgado'));

-- Exatamente um destino preenchido, coerente com o backend declarado. Sem
-- isto, uma linha 'db' sem `conteudo` vira foto fantasma: aparece na tela e
-- falha só na hora de montar o PDF.
ALTER TABLE public.produto_fotos
  DROP CONSTRAINT IF EXISTS produto_fotos_storage_check;
ALTER TABLE public.produto_fotos
  ADD CONSTRAINT produto_fotos_storage_check
  CHECK (
    (storage_backend = 'db' AND conteudo IS NOT NULL AND storage_key IS NULL)
    OR
    (storage_backend = 'r2' AND storage_key IS NOT NULL AND conteudo IS NULL)
    OR
    (storage_backend = 'purgado' AND conteudo IS NULL AND storage_key IS NULL)
  );

-- ── (3) Índices ─────────────────────────────────────────────────────────────
-- (tenant_id,id)/(tenant_id,uuid): obrigatórios em toda tabela nova (padrão de
-- 0021_cross_tenant_foreign_keys.sql); (tenant_id,id) também é o alvo exigido
-- pelas FKs compostas de tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_produto_fotos_tenant_id_id
  ON public.produto_fotos (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_produto_fotos_tenant_id_uuid
  ON public.produto_fotos (tenant_id, uuid);

CREATE INDEX IF NOT EXISTS idx_produto_fotos_tenant_updated
  ON public.produto_fotos (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_produto_fotos_tenant_deleted
  ON public.produto_fotos (tenant_id, deleted_at);

-- UMA foto ativa por produto. Parcial em `deleted_at IS NULL` pelo motivo de
-- `uq_pedido_fotos_papel_item` (0039) e de `uq_chamados_sac_tenant_numero_active`
-- (0035): foto excluída não pode reservar a vaga do produto para sempre —
-- trocar a foto É excluir a antiga e inserir outra.
--
-- É o índice, não a aplicação, que impede duas fotos ativas quando duas abas
-- gravam ao mesmo tempo. O service troca dentro de uma transação com a linha do
-- produto travada; sem o índice, duas transações concorrentes poderiam ambas
-- passar pela exclusão e ambas inserir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_produto_fotos_produto
  ON public.produto_fotos (tenant_id, produto_id)
  WHERE deleted_at IS NULL;

-- ── (4) FKs compostas de tenant ─────────────────────────────────────────────
-- Tabela nova e vazia: as FKs podem nascer já validadas. É a forma composta que
-- torna impossível apontar a foto para o produto de outro tenant.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_produto_fotos_tenant_produto') THEN
    ALTER TABLE public.produto_fotos
      ADD CONSTRAINT fk_produto_fotos_tenant_produto
      FOREIGN KEY (tenant_id, produto_id) REFERENCES public.produtos (tenant_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_produto_fotos_tenant_pedido_origem') THEN
    ALTER TABLE public.produto_fotos
      ADD CONSTRAINT fk_produto_fotos_tenant_pedido_origem
      FOREIGN KEY (tenant_id, origem_pedido_id) REFERENCES public.pedidos (tenant_id, id);
  END IF;
END $$;

-- ── (5) Trigger de updated_at ───────────────────────────────────────────────
-- updated_at é autoridade exclusiva do PostgreSQL (contrato de
-- 0020_utc_timestamps_db_authority.sql).
DROP TRIGGER IF EXISTS trg_produto_fotos_updated_at ON public.produto_fotos;
CREATE TRIGGER trg_produto_fotos_updated_at
  BEFORE INSERT OR UPDATE ON public.produto_fotos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── (6) Migração do dado ────────────────────────────────────────────────────
-- A foto vinculada a um item vira a foto do produto daquele item.
--
-- `DISTINCT ON` porque o destino admite UMA por produto e a origem pode ter
-- várias (dois pedidos diferentes com o mesmo produto, ou duas fotos do mesmo
-- item). Desempate determinístico: a mais recente.
--
-- O desempate NÃO consulta `usar_no_papel`, que seria a preferência natural: a
-- coluna veio de uma migration que nunca foi commitada, então ela existe só em
-- banco de desenvolvimento. Referenciá-la faria esta migration explodir em
-- qualquer banco que tenha `pedido_fotos` da 0034 sem aquela coluna.
--
-- Ficam de fora: soft-deletadas, purgadas pelo ERASURE (`storage_backend` já é
-- 'purgado' e `conteudo` é NULL — reinserir violaria `produto_fotos_storage_check`
-- e, pior, ressuscitaria um dado que a LGPD mandou apagar), fotos soltas e fotos
-- de item manual.
--
-- `IF EXISTS` porque a 0039 nunca foi commitada: em banco que nunca viu
-- `pedido_fotos` (instalação nova) não há o que migrar nem o que dropar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pedido_fotos') THEN
    INSERT INTO public.produto_fotos
      (tenant_id, produto_id, origem_pedido_id, nome_arquivo, mime_type,
       tamanho_bytes, storage_backend, conteudo, storage_key)
    SELECT DISTINCT ON (f.tenant_id, i.produto_id)
           f.tenant_id, i.produto_id, f.pedido_id, f.nome_arquivo, f.mime_type,
           f.tamanho_bytes, f.storage_backend, f.conteudo, f.storage_key
      FROM public.pedido_fotos f
      JOIN public.itens_pedido i
        ON i.id = f.item_pedido_id AND i.tenant_id = f.tenant_id
     WHERE f.deleted_at IS NULL
       AND i.deleted_at IS NULL
       AND i.produto_id IS NOT NULL
       AND f.storage_backend <> 'purgado'
     ORDER BY f.tenant_id, i.produto_id, f.created_at DESC;

    DROP TABLE public.pedido_fotos;
  END IF;
END $$;
