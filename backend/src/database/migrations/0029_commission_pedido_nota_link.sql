-- Fluxo Comercial Completo (Fase 2): comissão passa a ser derivada de nota
-- fiscal (1 comissão por nota), em vez de lançada manualmente com apenas
-- numero_pedido/numero_nfe em texto livre. Colunas novas 100% nullable:
-- comissões legadas continuam existindo só com os campos de texto livre.
ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS pedido_id int,
  ADD COLUMN IF NOT EXISTS nota_fiscal_id int,
  ADD COLUMN IF NOT EXISTS data_pagamento date;

-- NOT VALID: comissoes já tem dados de produção; validar contra todo o
-- histórico travaria a tabela sem necessidade (linhas legadas têm
-- pedido_id/nota_fiscal_id NULL, e FK composta com qualquer coluna NULL não é
-- verificada por padrão — MATCH SIMPLE). Novas escritas já ficam protegidas.
-- PostgreSQL não suporta "ADD CONSTRAINT IF NOT EXISTS" — idempotência via
-- checagem manual em pg_constraint (mesmo padrão de 0021).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comissoes_tenant_pedido') THEN
    ALTER TABLE public.comissoes
      ADD CONSTRAINT fk_comissoes_tenant_pedido
      FOREIGN KEY (tenant_id, pedido_id) REFERENCES public.pedidos (tenant_id, id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_comissoes_tenant_nota_fiscal') THEN
    ALTER TABLE public.comissoes
      ADD CONSTRAINT fk_comissoes_tenant_nota_fiscal
      FOREIGN KEY (tenant_id, nota_fiscal_id) REFERENCES public.notas_fiscais (tenant_id, id)
      NOT VALID;
  END IF;
END $$;

-- Regra de negócio: uma comissão por nota fiscal (1:1 nota<->comissão).
-- Parcial: ignora deleted_at (permite recriar após exclusão) e ignora
-- nota_fiscal_id NULL (comissões legadas, sem nota vinculada, não entram
-- nessa regra).
CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_tenant_nota_fiscal_active
  ON public.comissoes (tenant_id, nota_fiscal_id)
  WHERE deleted_at IS NULL AND nota_fiscal_id IS NOT NULL;

-- comissoes.status hoje é varchar livre (default 'pendente', sem constraint).
-- NOT VALID pelo mesmo motivo acima: não força validação retroativa de dado
-- de produção que porventura já tenha um valor fora do enum (defensivo).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comissoes_status_check') THEN
    ALTER TABLE public.comissoes
      ADD CONSTRAINT comissoes_status_check
      CHECK (status IN ('pendente', 'faturado', 'pago'))
      NOT VALID;
  END IF;
END $$;
