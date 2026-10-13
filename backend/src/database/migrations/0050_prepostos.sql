-- Prepostos: representantes externos (não são usuários do sistema) que vendem
-- em nome da empresa e recebem comissão sobre as notas dos pedidos deles.
-- O vínculo no pedido é `pedidos.preposto_id`; `vendedor_id` continua sendo o
-- usuário dono do pedido (ownership de VENDEDOR), por isso os dois coexistem.
CREATE TABLE IF NOT EXISTS public.prepostos (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  nome varchar(200) NOT NULL CHECK (length(trim(nome)) >= 2),
  -- CPF ou CNPJ, só dígitos (o DTO normaliza). Opcional.
  documento varchar(14) CHECK (documento IS NULL OR documento ~ '^([0-9]{11}|[0-9]{14})$'),
  telefone varchar(30),
  email varchar(200),
  endereco_completo text,
  -- Percentual padrão sobre o valor da nota. Cada venda guarda o seu snapshot.
  percentual_comissao numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (percentual_comissao >= 0 AND percentual_comissao <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prepostos_tenant_id_id ON public.prepostos (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prepostos_tenant_uuid ON public.prepostos (tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_prepostos_tenant_updated ON public.prepostos (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_prepostos_tenant_deleted ON public.prepostos (tenant_id, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_prepostos_tenant_documento_active
  ON public.prepostos (tenant_id, documento)
  WHERE deleted_at IS NULL AND documento IS NOT NULL;

DROP TRIGGER IF EXISTS trg_prepostos_updated_at ON public.prepostos;
CREATE TRIGGER trg_prepostos_updated_at
  BEFORE INSERT OR UPDATE ON public.prepostos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS preposto_id int;
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_preposto ON public.pedidos (tenant_id, preposto_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedidos_tenant_preposto') THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT fk_pedidos_tenant_preposto
      FOREIGN KEY (tenant_id, preposto_id) REFERENCES public.prepostos (tenant_id, id);
  END IF;
END $$;

-- Permissões (fonte da verdade: shared/src/permissions/catalog.ts). Padrão 0030.
INSERT INTO public.permissions (slug, description, module) VALUES
  ('prepostos.ver', 'Visualizar prepostos e suas vendas', 'prepostos'),
  ('prepostos.criar', 'Cadastrar prepostos', 'prepostos'),
  ('prepostos.editar', 'Editar prepostos', 'prepostos'),
  ('prepostos.deletar', 'Remover prepostos', 'prepostos')
ON CONFLICT (slug) DO NOTHING;

-- admin/gestao recebem o catálogo inteiro (DEFAULT_ROLE_PERMISSIONS).
INSERT INTO public.tenant_role_permissions (tenant_id, role_id, permission_slug)
SELECT tr.tenant_id, tr.id, p.slug
FROM public.tenant_roles tr
CROSS JOIN public.permissions p
WHERE tr.deleted_at IS NULL
  AND LOWER(tr.name) IN ('admin', 'gestao')
  AND p.slug IN ('prepostos.ver', 'prepostos.criar', 'prepostos.editar', 'prepostos.deletar')
ON CONFLICT (tenant_id, role_id, permission_slug) DO NOTHING;

-- financeiro só enxerga (paga comissão com financeiro.editar). Vendedor não
-- recebe nada: documento/contato do preposto e comissão de terceiro.
INSERT INTO public.tenant_role_permissions (tenant_id, role_id, permission_slug)
SELECT tr.tenant_id, tr.id, 'prepostos.ver'
FROM public.tenant_roles tr
WHERE tr.deleted_at IS NULL
  AND LOWER(tr.name) = 'financeiro'
ON CONFLICT (tenant_id, role_id, permission_slug) DO NOTHING;
