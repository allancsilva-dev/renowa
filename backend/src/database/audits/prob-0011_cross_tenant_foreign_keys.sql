-- Read-only pre-deployment audit for migration 0021.
-- Zero rows is required. Preserve output before repairing any production data.
SELECT 'pedidos.cliente_id' relation_name, child.id::text child_id, child.tenant_id child_tenant_id, parent.id::text parent_id, parent.tenant_id parent_tenant_id
FROM public.pedidos child JOIN public.clientes parent ON parent.id = child.cliente_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'pedidos.fornecedor_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.pedidos child JOIN public.fornecedores parent ON parent.id = child.fornecedor_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'pedidos.transportadora_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.pedidos child JOIN public.transportadoras parent ON parent.id = child.transportadora_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'clientes.transportadora_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.clientes child JOIN public.transportadoras parent ON parent.id = child.transportadora_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'produtos.fornecedor_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.produtos child JOIN public.fornecedores parent ON parent.id = child.fornecedor_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'inadimplencia.cliente_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.inadimplencia child JOIN public.clientes parent ON parent.id = child.cliente_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'comissoes.cliente_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.comissoes child JOIN public.clientes parent ON parent.id = child.cliente_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'comissoes.fornecedor_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.comissoes child JOIN public.fornecedores parent ON parent.id = child.fornecedor_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'parceiros_comerciais.cliente_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.parceiros_comerciais child JOIN public.clientes parent ON parent.id = child.cliente_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'parceiros_comerciais.fornecedor_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.parceiros_comerciais child JOIN public.fornecedores parent ON parent.id = child.fornecedor_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'itens_pedido.pedido_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.itens_pedido child JOIN public.pedidos parent ON parent.id = child.pedido_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'itens_pedido.produto_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.itens_pedido child JOIN public.produtos parent ON parent.id = child.produto_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'local_users.role_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.local_users child JOIN public.tenant_roles parent ON parent.id = child.role_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
-- tenant_role_permissions has no tenant_id before 0021; migration derives it deterministically from this role.
UNION ALL SELECT 'tenant_role_permissions.role_id', child.id::text, parent.tenant_id, parent.id::text, parent.tenant_id
FROM public.tenant_role_permissions child JOIN public.tenant_roles parent ON parent.id = child.role_id WHERE false
UNION ALL SELECT 'refresh_tokens.user_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.refresh_tokens child JOIN public.usuarios parent ON parent.id = child.user_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
UNION ALL SELECT 'refresh_tokens.replaced_by_id', child.id::text, child.tenant_id, parent.id::text, parent.tenant_id
FROM public.refresh_tokens child JOIN public.refresh_tokens parent ON parent.id = child.replaced_by_id WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id
ORDER BY relation_name, child_id;
