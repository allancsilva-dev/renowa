-- SAC: abertura de chamado. Segue a forma do pedido (cabeçalho + itens,
-- numeração sequencial própria, papel impresso), mas é domínio separado:
-- chamado NÃO gera nota fiscal nem comissão e por isso não entra na tabela
-- `pedidos` — misturá-los poluiria fila de faturamento e relatórios de caixa.
--
-- Layout de referência ("SAC RENOWA"): cabeçalho com cliente, fornecedor e
-- número da NFE; linhas com COD, QUANT, MOTIVO, VL UNI. (NF) e VL. TOTAL NF;
-- rodapé com TOTAL.

-- Sequence global, mesma natureza de `pedidos_numero_seq`: `nextval` é livre
-- de lock e nunca colide; buracos em rollback são esperados e aceitos.
CREATE SEQUENCE IF NOT EXISTS public.sac_numero_seq START WITH 1;

CREATE TABLE IF NOT EXISTS public.chamados_sac (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  numero_chamado int NOT NULL,
  cliente_id int NOT NULL,
  -- "Importador" no enunciado do negócio é o fornecedor cadastrado.
  fornecedor_id int NOT NULL,
  numero_nfe varchar,
  data date,
  -- Soma dos itens ativos, derivada pelo servidor (nunca enviada pelo cliente).
  total numeric(18, 2),
  status varchar NOT NULL DEFAULT 'aberto',
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chamados_sac_status_check') THEN
    ALTER TABLE public.chamados_sac
      ADD CONSTRAINT chamados_sac_status_check
      CHECK (status IN ('aberto', 'em_andamento', 'resolvido', 'cancelado'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chamados_sac_tenant_id_id
  ON public.chamados_sac (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chamados_sac_tenant_id_uuid
  ON public.chamados_sac (tenant_id, uuid);

-- Unicidade de negócio sempre por tenant, nunca global. Parcial para que o
-- soft delete libere o número (mesmo critério de notas_fiscais em 0028).
CREATE UNIQUE INDEX IF NOT EXISTS uq_chamados_sac_tenant_numero_active
  ON public.chamados_sac (tenant_id, numero_chamado)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chamados_sac_tenant_updated
  ON public.chamados_sac (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_chamados_sac_tenant_deleted
  ON public.chamados_sac (tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_chamados_sac_tenant_status
  ON public.chamados_sac (tenant_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chamados_sac_tenant_cliente') THEN
    ALTER TABLE public.chamados_sac
      ADD CONSTRAINT fk_chamados_sac_tenant_cliente
      FOREIGN KEY (tenant_id, cliente_id) REFERENCES public.clientes (tenant_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_chamados_sac_tenant_fornecedor') THEN
    ALTER TABLE public.chamados_sac
      ADD CONSTRAINT fk_chamados_sac_tenant_fornecedor
      FOREIGN KEY (tenant_id, fornecedor_id) REFERENCES public.fornecedores (tenant_id, id);
  END IF;
END $$;

-- ── Itens do chamado ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itens_chamado_sac (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  chamado_id int NOT NULL,
  -- Vínculo opcional com produto cadastrado, igual itens_pedido: o SAC também
  -- trata item que nunca foi cadastrado.
  produto_id int,
  codigo varchar NOT NULL,
  quantidade numeric(18, 3) NOT NULL,
  motivo varchar NOT NULL,
  valor_unitario numeric(18, 2) NOT NULL,
  -- quantidade * valor_unitario, derivado pelo servidor.
  valor_total numeric(18, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itens_chamado_sac_quantidade_check') THEN
    ALTER TABLE public.itens_chamado_sac
      ADD CONSTRAINT itens_chamado_sac_quantidade_check
      CHECK (quantidade >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itens_chamado_sac_valor_unitario_check') THEN
    ALTER TABLE public.itens_chamado_sac
      ADD CONSTRAINT itens_chamado_sac_valor_unitario_check
      CHECK (valor_unitario >= 0);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_chamado_sac_tenant_id_id
  ON public.itens_chamado_sac (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_chamado_sac_tenant_id_uuid
  ON public.itens_chamado_sac (tenant_id, uuid);

CREATE INDEX IF NOT EXISTS idx_itens_chamado_sac_tenant_chamado
  ON public.itens_chamado_sac (tenant_id, chamado_id);
CREATE INDEX IF NOT EXISTS idx_itens_chamado_sac_tenant_updated
  ON public.itens_chamado_sac (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_itens_chamado_sac_tenant_deleted
  ON public.itens_chamado_sac (tenant_id, deleted_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_itens_chamado_sac_tenant_chamado') THEN
    ALTER TABLE public.itens_chamado_sac
      ADD CONSTRAINT fk_itens_chamado_sac_tenant_chamado
      FOREIGN KEY (tenant_id, chamado_id) REFERENCES public.chamados_sac (tenant_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_itens_chamado_sac_tenant_produto') THEN
    ALTER TABLE public.itens_chamado_sac
      ADD CONSTRAINT fk_itens_chamado_sac_tenant_produto
      FOREIGN KEY (tenant_id, produto_id) REFERENCES public.produtos (tenant_id, id);
  END IF;
END $$;

-- updated_at é autoridade exclusiva do PostgreSQL (contrato de 0020).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chamados_sac_updated_at ON public.chamados_sac;
CREATE TRIGGER trg_chamados_sac_updated_at
  BEFORE INSERT OR UPDATE ON public.chamados_sac
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_itens_chamado_sac_updated_at ON public.itens_chamado_sac;
CREATE TRIGGER trg_itens_chamado_sac_updated_at
  BEFORE INSERT OR UPDATE ON public.itens_chamado_sac
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Permissões ──────────────────────────────────────────────────────────────
-- Fonte da verdade em shared/src/permissions/catalog.ts; mesmo padrão de
-- 0030_permission_catalog_faturamento.sql.
INSERT INTO public.permissions (slug, description, module) VALUES
  ('sac.ver', 'Visualizar chamados de SAC', 'sac'),
  ('sac.criar', 'Abrir chamados de SAC', 'sac'),
  ('sac.editar', 'Editar chamados de SAC e alterar o status', 'sac'),
  ('sac.deletar', 'Remover chamados de SAC', 'sac')
ON CONFLICT (slug) DO NOTHING;

-- admin/gestao recebem o catálogo inteiro em DEFAULT_ROLE_PERMISSIONS.
-- LOWER(tr.name): defesa independente de case. tr.deleted_at IS NULL: nunca
-- conceder permissão a uma role soft-deleted.
INSERT INTO public.tenant_role_permissions (tenant_id, role_id, permission_slug)
SELECT tr.tenant_id, tr.id, p.slug
FROM public.tenant_roles tr
CROSS JOIN public.permissions p
WHERE tr.deleted_at IS NULL
  AND LOWER(tr.name) IN ('admin', 'gestao')
  AND p.slug IN ('sac.ver', 'sac.criar', 'sac.editar', 'sac.deletar')
ON CONFLICT (tenant_id, role_id, permission_slug) DO NOTHING;
