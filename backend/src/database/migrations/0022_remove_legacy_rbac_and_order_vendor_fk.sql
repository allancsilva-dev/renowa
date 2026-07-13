-- PROB-0034: tenant_role_permissions is the sole RBAC model.
DROP TABLE IF EXISTS public.role_permissions;

-- PROB-0036: clear invalid optional references before enforcing tenant ownership.
UPDATE public.pedidos order_row
SET vendedor_id = NULL
WHERE vendedor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.usuarios seller
    WHERE seller.tenant_id = order_row.tenant_id
      AND seller.id = order_row.vendedor_id
  );

CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_vendedor
  ON public.pedidos (tenant_id, vendedor_id)
  WHERE vendedor_id IS NOT NULL;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS fk_pedidos_tenant_vendedor;
ALTER TABLE public.pedidos
  ADD CONSTRAINT fk_pedidos_tenant_vendedor
  FOREIGN KEY (tenant_id, vendedor_id)
  REFERENCES public.usuarios (tenant_id, id)
  ON DELETE RESTRICT;
