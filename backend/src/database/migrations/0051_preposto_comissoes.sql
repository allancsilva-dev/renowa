-- Vendas do preposto: uma linha por nota fiscal ativa de pedido com preposto.
-- Nasce junto com a nota (FaturamentoService), com snapshot do percentual do
-- cadastro; o percentual de cada venda é ajustável enquanto não paga. Pagar
-- cria uma saída no Financeiro (financeiro_movimentacao) e guarda o vínculo;
-- estornar apaga essa saída. A comissão da EMPRESA (comissoes) não muda.
CREATE TABLE IF NOT EXISTS public.preposto_comissoes (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  preposto_id int NOT NULL,
  pedido_id int NOT NULL,
  nota_fiscal_id int NOT NULL,
  numero_nfe varchar(60),
  data_faturamento date,
  valor_faturado numeric(18, 2) NOT NULL CHECK (valor_faturado >= 0),
  perc_comissao numeric(5, 2) NOT NULL CHECK (perc_comissao >= 0 AND perc_comissao <= 100),
  valor_comissao numeric(18, 2) NOT NULL CHECK (valor_comissao >= 0),
  status varchar(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
  data_pagamento date,
  movimento_id int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0),
  -- Pago <=> existe a saída no Financeiro e a data. Sem isto, um UPDATE
  -- parcial deixaria comissão "paga" sem dinheiro saindo do caixa (ou o contrário).
  CONSTRAINT preposto_comissoes_pagamento_check CHECK (
    (status = 'pago' AND movimento_id IS NOT NULL AND data_pagamento IS NOT NULL)
    OR (status = 'pendente' AND movimento_id IS NULL AND data_pagamento IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_preposto_comissoes_tenant_id_id ON public.preposto_comissoes (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_preposto_comissoes_tenant_uuid ON public.preposto_comissoes (tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_preposto_comissoes_tenant_updated ON public.preposto_comissoes (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_preposto_comissoes_tenant_preposto_data
  ON public.preposto_comissoes (tenant_id, preposto_id, data_faturamento);
-- Uma venda por nota ativa: retry/duplo clique não paga comissão duas vezes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_preposto_comissoes_nota_ativa
  ON public.preposto_comissoes (tenant_id, nota_fiscal_id)
  WHERE deleted_at IS NULL;
-- Uma saída do Financeiro paga no máximo uma venda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_preposto_comissoes_movimento
  ON public.preposto_comissoes (tenant_id, movimento_id)
  WHERE deleted_at IS NULL AND movimento_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_preposto_comissoes_preposto') THEN
    ALTER TABLE public.preposto_comissoes ADD CONSTRAINT fk_preposto_comissoes_preposto
      FOREIGN KEY (tenant_id, preposto_id) REFERENCES public.prepostos (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_preposto_comissoes_pedido') THEN
    ALTER TABLE public.preposto_comissoes ADD CONSTRAINT fk_preposto_comissoes_pedido
      FOREIGN KEY (tenant_id, pedido_id) REFERENCES public.pedidos (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_preposto_comissoes_nota') THEN
    ALTER TABLE public.preposto_comissoes ADD CONSTRAINT fk_preposto_comissoes_nota
      FOREIGN KEY (tenant_id, nota_fiscal_id) REFERENCES public.notas_fiscais (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_preposto_comissoes_movimento') THEN
    ALTER TABLE public.preposto_comissoes ADD CONSTRAINT fk_preposto_comissoes_movimento
      FOREIGN KEY (tenant_id, movimento_id) REFERENCES public.financeiro_movimentacao (tenant_id, id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_preposto_comissoes_updated_at ON public.preposto_comissoes;
CREATE TRIGGER trg_preposto_comissoes_updated_at
  BEFORE INSERT OR UPDATE ON public.preposto_comissoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
