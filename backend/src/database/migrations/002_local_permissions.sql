-- =============================================================================
-- Renowa — Migration 002: permissões locais (RBAC)
-- =============================================================================

CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  module VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission_slug VARCHAR(100) NOT NULL REFERENCES permissions(slug) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, permission_slug)
);

CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

INSERT INTO permissions (slug, description, module) VALUES
  ('clientes.ver', 'Visualizar clientes', 'clientes'),
  ('clientes.criar', 'Criar clientes', 'clientes'),
  ('clientes.editar', 'Editar clientes', 'clientes'),
  ('clientes.deletar', 'Remover clientes', 'clientes'),
  ('pedidos.ver', 'Visualizar pedidos', 'pedidos'),
  ('pedidos.criar', 'Criar pedidos', 'pedidos'),
  ('pedidos.editar', 'Editar pedidos', 'pedidos'),
  ('pedidos.deletar', 'Remover pedidos', 'pedidos'),
  ('produtos.ver', 'Visualizar produtos', 'produtos'),
  ('produtos.criar', 'Criar produtos', 'produtos'),
  ('produtos.editar', 'Editar produtos', 'produtos'),
  ('produtos.deletar', 'Remover produtos', 'produtos'),
  ('fornecedores.ver', 'Visualizar fornecedores', 'fornecedores'),
  ('fornecedores.criar', 'Criar fornecedores', 'fornecedores'),
  ('fornecedores.editar', 'Editar fornecedores', 'fornecedores'),
  ('fornecedores.deletar', 'Remover fornecedores', 'fornecedores'),
  ('transportadoras.ver', 'Visualizar transportadoras', 'transportadoras'),
  ('transportadoras.criar', 'Criar transportadoras', 'transportadoras'),
  ('transportadoras.editar', 'Editar transportadoras', 'transportadoras'),
  ('transportadoras.deletar', 'Remover transportadoras', 'transportadoras'),
  ('financeiro.ver', 'Visualizar dados financeiros', 'financeiro'),
  ('financeiro.editar', 'Alterar dados financeiros', 'financeiro')
ON CONFLICT (slug) DO NOTHING;

-- VENDEDOR
INSERT INTO role_permissions (role, permission_slug)
SELECT 'VENDEDOR', p.slug
FROM permissions p
WHERE p.slug IN (
  'clientes.ver', 'clientes.criar', 'clientes.editar',
  'pedidos.ver', 'pedidos.criar', 'pedidos.editar',
  'produtos.ver', 'produtos.criar', 'produtos.editar',
  'fornecedores.ver', 'fornecedores.criar', 'fornecedores.editar',
  'transportadoras.ver', 'transportadoras.criar', 'transportadoras.editar'
)
ON CONFLICT (role, permission_slug) DO NOTHING;

-- FINANCEIRO
INSERT INTO role_permissions (role, permission_slug)
SELECT 'FINANCEIRO', p.slug
FROM permissions p
WHERE p.slug IN ('financeiro.ver', 'financeiro.editar')
ON CONFLICT (role, permission_slug) DO NOTHING;

-- GESTAO
INSERT INTO role_permissions (role, permission_slug)
SELECT 'GESTAO', p.slug
FROM permissions p
ON CONFLICT (role, permission_slug) DO NOTHING;

-- ADMIN
INSERT INTO role_permissions (role, permission_slug)
SELECT 'ADMIN', p.slug
FROM permissions p
ON CONFLICT (role, permission_slug) DO NOTHING;
