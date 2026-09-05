-- CNPJ é único somente por tenant, categoria e registro ativo. Antes de
-- aplicar, saneie duplicados ativos; a falha abaixo impede índice parcial em
-- estado inconsistente e mantém a migration atômica.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.clientes
    WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
    GROUP BY tenant_id, regexp_replace(cnpj, '\D', '', 'g') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.fornecedores
    WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
    GROUP BY tenant_id, regexp_replace(cnpj, '\D', '', 'g') HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM public.transportadoras
    WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL
    GROUP BY tenant_id, regexp_replace(cnpj, '\D', '', 'g') HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem CNPJs duplicados ativos. Saneie clientes, fornecedores e transportadoras antes de aplicar 0046.';
  END IF;
END $$;

CREATE UNIQUE INDEX uq_clientes_tenant_cnpj_active
  ON public.clientes (tenant_id, (regexp_replace(cnpj, '\D', '', 'g')))
  WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL;

CREATE UNIQUE INDEX uq_fornecedores_tenant_cnpj_active
  ON public.fornecedores (tenant_id, (regexp_replace(cnpj, '\D', '', 'g')))
  WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL;

CREATE UNIQUE INDEX uq_transportadoras_tenant_cnpj_active
  ON public.transportadoras (tenant_id, (regexp_replace(cnpj, '\D', '', 'g')))
  WHERE deleted_at IS NULL AND NULLIF(regexp_replace(COALESCE(cnpj, ''), '\D', '', 'g'), '') IS NOT NULL;
