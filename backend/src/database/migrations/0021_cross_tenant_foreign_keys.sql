-- PROB-0011: enforce tenant ownership in every FK between tenant-owned tables.
-- Existing violations abort the migration. Data ownership must never be guessed here.
-- The old 007_* file is ignored by the four-digit migration runner; carry its model forward.
ALTER TABLE public.tenant_role_permissions
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.tenant_role_permissions permission_link
SET tenant_id = role.tenant_id
FROM public.tenant_roles role
WHERE role.id = permission_link.role_id
  AND permission_link.tenant_id IS NULL;

ALTER TABLE public.tenant_role_permissions
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.tenant_role_permissions
  DROP CONSTRAINT IF EXISTS uq_tenant_role_permissions_role_permission;
ALTER TABLE public.tenant_role_permissions
  DROP CONSTRAINT IF EXISTS "UQ_46a5709120690ca37b81b877ce1";
ALTER TABLE public.tenant_role_permissions
  DROP CONSTRAINT IF EXISTS uq_tenant_role_permissions_tenant_role_permission;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_role_permissions_tenant_role_permission
  ON public.tenant_role_permissions (tenant_id, role_id, permission_slug);

DO $$
DECLARE
  relation record;
  violation_count bigint;
BEGIN
  FOR relation IN
    SELECT * FROM (VALUES
      ('pedidos', 'clientes', 'cliente_id'),
      ('pedidos', 'fornecedores', 'fornecedor_id'),
      ('pedidos', 'transportadoras', 'transportadora_id'),
      ('clientes', 'transportadoras', 'transportadora_id'),
      ('produtos', 'fornecedores', 'fornecedor_id'),
      ('inadimplencia', 'clientes', 'cliente_id'),
      ('comissoes', 'clientes', 'cliente_id'),
      ('comissoes', 'fornecedores', 'fornecedor_id'),
      ('parceiros_comerciais', 'clientes', 'cliente_id'),
      ('parceiros_comerciais', 'fornecedores', 'fornecedor_id'),
      ('itens_pedido', 'pedidos', 'pedido_id'),
      ('itens_pedido', 'produtos', 'produto_id'),
      ('local_users', 'tenant_roles', 'role_id'),
      ('tenant_role_permissions', 'tenant_roles', 'role_id'),
      ('refresh_tokens', 'usuarios', 'user_id'),
      ('refresh_tokens', 'refresh_tokens', 'replaced_by_id')
    ) AS relations(child_table, parent_table, foreign_key)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I child JOIN public.%I parent ON parent.id = child.%I WHERE child.%I IS NOT NULL AND child.tenant_id IS DISTINCT FROM parent.tenant_id',
      relation.child_table,
      relation.parent_table,
      relation.foreign_key,
      relation.foreign_key
    ) INTO violation_count;

    IF violation_count > 0 THEN
      RAISE EXCEPTION
        'Cross-tenant audit failed: %.% -> % has % violation(s)',
        relation.child_table,
        relation.foreign_key,
        relation.parent_table,
        violation_count;
    END IF;
  END LOOP;
END $$;

-- PostgreSQL requires a unique key matching every composite FK target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_tenant_id_id
  ON public.clientes (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fornecedores_tenant_id_id
  ON public.fornecedores (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transportadoras_tenant_id_id
  ON public.transportadoras (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_tenant_id_id
  ON public.produtos (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_tenant_id_id
  ON public.pedidos (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_roles_tenant_id_id
  ON public.tenant_roles (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_tenant_id_id
  ON public.usuarios (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_tokens_tenant_id_id
  ON public.refresh_tokens (tenant_id, id);

-- Support FK checks and tenant-scoped joins from child to parent.
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_cliente
  ON public.pedidos (tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_fornecedor
  ON public.pedidos (tenant_id, fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_transportadora
  ON public.pedidos (tenant_id, transportadora_id);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_transportadora
  ON public.clientes (tenant_id, transportadora_id);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_fornecedor
  ON public.produtos (tenant_id, fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_inadimplencia_tenant_cliente
  ON public.inadimplencia (tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_tenant_cliente
  ON public.comissoes (tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_comissoes_tenant_fornecedor
  ON public.comissoes (tenant_id, fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_tenant_cliente
  ON public.parceiros_comerciais (tenant_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_parceiros_tenant_fornecedor
  ON public.parceiros_comerciais (tenant_id, fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_itens_tenant_pedido
  ON public.itens_pedido (tenant_id, pedido_id);
CREATE INDEX IF NOT EXISTS idx_itens_tenant_produto
  ON public.itens_pedido (tenant_id, produto_id);
CREATE INDEX IF NOT EXISTS idx_local_users_tenant_role
  ON public.local_users (tenant_id, role_id);
CREATE INDEX IF NOT EXISTS idx_tenant_role_permissions_tenant_role
  ON public.tenant_role_permissions (tenant_id, role_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_user
  ON public.refresh_tokens (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_replacement
  ON public.refresh_tokens (tenant_id, replaced_by_id);

-- NOT VALID protects new writes immediately and allows controlled historical validation.
DO $$
DECLARE
  relation record;
BEGIN
  FOR relation IN
    SELECT * FROM (VALUES
      ('fk_pedidos_tenant_cliente', 'pedidos', 'clientes', 'cliente_id', ''),
      ('fk_pedidos_tenant_fornecedor', 'pedidos', 'fornecedores', 'fornecedor_id', ''),
      ('fk_pedidos_tenant_transportadora', 'pedidos', 'transportadoras', 'transportadora_id', ''),
      ('fk_clientes_tenant_transportadora', 'clientes', 'transportadoras', 'transportadora_id', ''),
      ('fk_produtos_tenant_fornecedor', 'produtos', 'fornecedores', 'fornecedor_id', ''),
      ('fk_inadimplencia_tenant_cliente', 'inadimplencia', 'clientes', 'cliente_id', ''),
      ('fk_comissoes_tenant_cliente', 'comissoes', 'clientes', 'cliente_id', ''),
      ('fk_comissoes_tenant_fornecedor', 'comissoes', 'fornecedores', 'fornecedor_id', ''),
      ('fk_parceiros_tenant_cliente', 'parceiros_comerciais', 'clientes', 'cliente_id', ''),
      ('fk_parceiros_tenant_fornecedor', 'parceiros_comerciais', 'fornecedores', 'fornecedor_id', ''),
      ('fk_itens_tenant_pedido', 'itens_pedido', 'pedidos', 'pedido_id', ''),
      ('fk_itens_tenant_produto', 'itens_pedido', 'produtos', 'produto_id', ''),
      ('fk_local_users_tenant_role', 'local_users', 'tenant_roles', 'role_id', ''),
      ('fk_tenant_role_permissions_tenant_role', 'tenant_role_permissions', 'tenant_roles', 'role_id', ' ON DELETE CASCADE'),
      ('fk_refresh_tokens_tenant_user', 'refresh_tokens', 'usuarios', 'user_id', ''),
      ('fk_refresh_tokens_tenant_replacement', 'refresh_tokens', 'refresh_tokens', 'replaced_by_id', '')
    ) AS relations(constraint_name, child_table, parent_table, foreign_key, delete_action)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = relation.constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %I) REFERENCES public.%I (tenant_id, id)%s NOT VALID',
        relation.child_table,
        relation.constraint_name,
        relation.foreign_key,
        relation.parent_table,
        relation.delete_action
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  relation record;
  legacy record;
BEGIN
  FOR relation IN
    SELECT * FROM (VALUES
      ('fk_pedidos_tenant_cliente', 'pedidos', 'clientes', 'cliente_id'),
      ('fk_pedidos_tenant_fornecedor', 'pedidos', 'fornecedores', 'fornecedor_id'),
      ('fk_pedidos_tenant_transportadora', 'pedidos', 'transportadoras', 'transportadora_id'),
      ('fk_clientes_tenant_transportadora', 'clientes', 'transportadoras', 'transportadora_id'),
      ('fk_produtos_tenant_fornecedor', 'produtos', 'fornecedores', 'fornecedor_id'),
      ('fk_inadimplencia_tenant_cliente', 'inadimplencia', 'clientes', 'cliente_id'),
      ('fk_comissoes_tenant_cliente', 'comissoes', 'clientes', 'cliente_id'),
      ('fk_comissoes_tenant_fornecedor', 'comissoes', 'fornecedores', 'fornecedor_id'),
      ('fk_parceiros_tenant_cliente', 'parceiros_comerciais', 'clientes', 'cliente_id'),
      ('fk_parceiros_tenant_fornecedor', 'parceiros_comerciais', 'fornecedores', 'fornecedor_id'),
      ('fk_itens_tenant_pedido', 'itens_pedido', 'pedidos', 'pedido_id'),
      ('fk_itens_tenant_produto', 'itens_pedido', 'produtos', 'produto_id'),
      ('fk_local_users_tenant_role', 'local_users', 'tenant_roles', 'role_id'),
      ('fk_tenant_role_permissions_tenant_role', 'tenant_role_permissions', 'tenant_roles', 'role_id'),
      ('fk_refresh_tokens_tenant_user', 'refresh_tokens', 'usuarios', 'user_id'),
      ('fk_refresh_tokens_tenant_replacement', 'refresh_tokens', 'refresh_tokens', 'replaced_by_id')
    ) AS relations(constraint_name, child_table, parent_table, foreign_key)
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I VALIDATE CONSTRAINT %I',
      relation.child_table,
      relation.constraint_name
    );

    -- Remove any legacy one-column FK independent of generated TypeORM name.
    FOR legacy IN
      SELECT constraint_row.conname
      FROM pg_constraint constraint_row
      JOIN pg_attribute child_column
        ON child_column.attrelid = constraint_row.conrelid
       AND child_column.attnum = constraint_row.conkey[1]
      WHERE constraint_row.contype = 'f'
        AND constraint_row.conrelid = format('public.%I', relation.child_table)::regclass
        AND constraint_row.confrelid = format('public.%I', relation.parent_table)::regclass
        AND cardinality(constraint_row.conkey) = 1
        AND child_column.attname = relation.foreign_key
    LOOP
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        relation.child_table,
        legacy.conname
      );
    END LOOP;
  END LOOP;
END $$;
