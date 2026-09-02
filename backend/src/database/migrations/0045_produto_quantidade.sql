-- Quantidade informativa do produto. Não representa estoque e não é alterada
-- por pedidos. O padrão 1 mantém cadastros antigos e novas integrações válidos.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS quantidade integer NOT NULL DEFAULT 1;

ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_quantidade_nonnegative;

ALTER TABLE public.produtos
  ADD CONSTRAINT produtos_quantidade_nonnegative CHECK (quantidade >= 0);

COMMENT ON COLUMN public.produtos.quantidade IS
  'Quantidade informativa, alterada manualmente no cadastro do produto; não representa saldo de estoque.';
