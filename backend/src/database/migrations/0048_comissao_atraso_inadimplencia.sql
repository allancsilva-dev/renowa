-- Atraso de comissão: novo estado bloqueado e vínculo rastreável com
-- Inadimplência. Estados legados permanecem válidos para compatibilidade.
ALTER TABLE public.inadimplencia
  ADD COLUMN IF NOT EXISTS comissao_id int;

ALTER TABLE public.comissoes DROP CONSTRAINT IF EXISTS comissoes_status_check;
ALTER TABLE public.comissoes
  ADD CONSTRAINT comissoes_status_check
  CHECK (status IN ('pendente', 'faturado', 'pago', 'bloqueado')) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_inadimplencia_tenant_comissao') THEN
    ALTER TABLE public.inadimplencia
      ADD CONSTRAINT fk_inadimplencia_tenant_comissao
      FOREIGN KEY (tenant_id, comissao_id) REFERENCES public.comissoes (tenant_id, id)
      NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_inadimplencia_tenant_comissao_active
  ON public.inadimplencia (tenant_id, comissao_id)
  WHERE deleted_at IS NULL AND comissao_id IS NOT NULL;
