-- Fluxo Comercial Completo (Fase 2): ciclo de vida de pedido passa de
-- 3 estados ('em_aberto'|'concluido'|'cancelado') para 5, cobrindo liberação
-- e faturamento parcial/total: 'em_aberto'|'liberado'|'parcialmente_faturado'
-- |'faturado'|'cancelado'. 'concluido' deixa de existir.
--
-- ORDEM IMPORTA: a normalização do dado legado tem que rodar ANTES do
-- CHECK, senão o ADD CONSTRAINT (mesmo NOT VALID, que não varre linhas
-- existentes na criação) ficaria inconsistente com o app assim que qualquer
-- linha 'concluido' fosse tocada de novo (UPDATE dispararia violação).
-- Confirmado por grep: o app mobile não escreve string hardcoded de status
-- de pedido (só sincroniza o campo) — normalização é segura para o sync.
UPDATE public.pedidos SET status = 'liberado' WHERE status = 'concluido';

-- NOT VALID: evita full scan/lock de validação em tabela grande agora;
-- novas escritas já são protegidas imediatamente. Validação históricas fica
-- para uma migration futura dedicada (mesmo padrão de 0021).
-- PostgreSQL não suporta "ADD CONSTRAINT IF NOT EXISTS" (só ADD COLUMN
-- aceita essa cláusula) — idempotência via checagem manual em pg_constraint,
-- mesmo padrão usado em 0021_cross_tenant_foreign_keys.sql.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_status_check') THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_status_check
      CHECK (status IN ('em_aberto', 'liberado', 'parcialmente_faturado', 'faturado', 'cancelado'))
      NOT VALID;
  END IF;
END $$;
