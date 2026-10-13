-- Ajuste do valor do pedido no Faturamento (somente ADMIN).
-- O ajuste NÃO sobrescreve total_sem_imposto/total_com_imposto: itens, papel do
-- pedido e histórico continuam íntegros. O faturamento passa a usar
-- COALESCE(valor_ajustado, total_com_imposto, total_sem_imposto) como valor.
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS valor_ajustado numeric(18, 2),
  ADD COLUMN IF NOT EXISTS valor_ajustado_motivo text,
  ADD COLUMN IF NOT EXISTS valor_ajustado_por uuid,
  ADD COLUMN IF NOT EXISTS valor_ajustado_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_valor_ajustado_check') THEN
    -- Ajuste vem completo (valor positivo + motivo + autor + data) ou não existe.
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_valor_ajustado_check CHECK (
      (valor_ajustado IS NULL AND valor_ajustado_motivo IS NULL AND valor_ajustado_por IS NULL AND valor_ajustado_em IS NULL)
      OR (valor_ajustado > 0 AND length(trim(valor_ajustado_motivo)) >= 3
          AND valor_ajustado_por IS NOT NULL AND valor_ajustado_em IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_pedidos_valor_ajustado_por') THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT fk_pedidos_valor_ajustado_por
      FOREIGN KEY (tenant_id, valor_ajustado_por) REFERENCES public.usuarios (tenant_id, uuid);
  END IF;
END $$;
