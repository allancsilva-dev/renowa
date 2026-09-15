CREATE TABLE IF NOT EXISTS public.faturamento_finalizacoes (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  pedido_id int NOT NULL,
  saldo_encerrado numeric(18, 2) NOT NULL CHECK (saldo_encerrado > 0),
  motivo text NOT NULL CHECK (length(trim(motivo)) >= 3),
  finalizado_por uuid NOT NULL,
  reaberto_at timestamptz,
  reaberto_por uuid,
  reabertura_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_faturamento_finalizacoes_tenant_id_id
  ON public.faturamento_finalizacoes (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturamento_finalizacoes_tenant_uuid
  ON public.faturamento_finalizacoes (tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_faturamento_finalizacoes_tenant_pedido
  ON public.faturamento_finalizacoes (tenant_id, pedido_id);
CREATE INDEX IF NOT EXISTS idx_faturamento_finalizacoes_tenant_updated
  ON public.faturamento_finalizacoes (tenant_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturamento_finalizacao_ativa
  ON public.faturamento_finalizacoes (tenant_id, pedido_id)
  WHERE deleted_at IS NULL AND reaberto_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_faturamento_finalizacoes_pedido') THEN
    ALTER TABLE public.faturamento_finalizacoes ADD CONSTRAINT fk_faturamento_finalizacoes_pedido
      FOREIGN KEY (tenant_id, pedido_id) REFERENCES public.pedidos (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_faturamento_finalizacoes_finalizado_por') THEN
    ALTER TABLE public.faturamento_finalizacoes ADD CONSTRAINT fk_faturamento_finalizacoes_finalizado_por
      FOREIGN KEY (tenant_id, finalizado_por) REFERENCES public.usuarios (tenant_id, uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_faturamento_finalizacoes_reaberto_por') THEN
    ALTER TABLE public.faturamento_finalizacoes ADD CONSTRAINT fk_faturamento_finalizacoes_reaberto_por
      FOREIGN KEY (tenant_id, reaberto_por) REFERENCES public.usuarios (tenant_id, uuid);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_faturamento_finalizacoes_updated_at ON public.faturamento_finalizacoes;
CREATE TRIGGER trg_faturamento_finalizacoes_updated_at
  BEFORE INSERT OR UPDATE ON public.faturamento_finalizacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Comissões antigas vinculadas a notas passam a carregar o snapshot fiscal.
UPDATE public.comissoes c
SET numero_nfe = n.numero_nota,
    data_faturamento = COALESCE(n.data_emissao, n.created_at::date)
FROM public.notas_fiscais n
WHERE c.tenant_id = n.tenant_id
  AND c.nota_fiscal_id = n.id
  AND c.deleted_at IS NULL
  AND (c.numero_nfe IS DISTINCT FROM n.numero_nota
       OR c.data_faturamento IS DISTINCT FROM COALESCE(n.data_emissao, n.created_at::date));

CREATE INDEX IF NOT EXISTS idx_comissoes_tenant_data_faturamento
  ON public.comissoes (tenant_id, data_faturamento);
