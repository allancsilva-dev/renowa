-- Comissão de vendedor passa a aceitar tanto preposto quanto usuário interno.
-- A tabela mantém o nome histórico para não quebrar bancos e integrações já existentes.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS percentual_comissao numeric(5, 2) NOT NULL DEFAULT 0
  CHECK (percentual_comissao >= 0 AND percentual_comissao <= 100);

ALTER TABLE public.preposto_comissoes
  ALTER COLUMN preposto_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS vendedor_id int;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_preposto_comissoes_vendedor') THEN
    ALTER TABLE public.preposto_comissoes ADD CONSTRAINT fk_preposto_comissoes_vendedor
      FOREIGN KEY (tenant_id, vendedor_id) REFERENCES public.usuarios (tenant_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'preposto_comissoes_recebedor_check') THEN
    ALTER TABLE public.preposto_comissoes ADD CONSTRAINT preposto_comissoes_recebedor_check
      CHECK (num_nonnulls(preposto_id, vendedor_id) = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_preposto_comissoes_tenant_vendedor_data
  ON public.preposto_comissoes (tenant_id, vendedor_id, data_faturamento)
  WHERE vendedor_id IS NOT NULL;

-- Histórico: toda NF ativa de pedido com usuário vendedor ganha pendência.
-- Percentual começa em zero; ao configurar o usuário, o backend atualiza apenas
-- estas pendências zeradas. Comissões já pagas ou ajustadas nunca são reescritas.
INSERT INTO public.preposto_comissoes (
  uuid, tenant_id, preposto_id, vendedor_id, pedido_id, nota_fiscal_id,
  numero_nfe, data_faturamento, valor_faturado, perc_comissao,
  valor_comissao, status, data_pagamento, movimento_id
)
SELECT
  public.uuid_generate_v4(), p.tenant_id, NULL, p.vendedor_id, p.id, n.id,
  n.numero_nota, COALESCE(n.data_emissao, (n.created_at AT TIME ZONE 'America/Sao_Paulo')::date), n.valor,
  0, 0, 'pendente', NULL, NULL
FROM public.notas_fiscais n
JOIN public.pedidos p
  ON p.tenant_id = n.tenant_id AND p.id = n.pedido_id AND p.deleted_at IS NULL
WHERE n.deleted_at IS NULL
  AND p.vendedor_id IS NOT NULL
  AND p.preposto_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.preposto_comissoes pc
    WHERE pc.tenant_id = n.tenant_id
      AND pc.nota_fiscal_id = n.id
      AND pc.deleted_at IS NULL
  );
