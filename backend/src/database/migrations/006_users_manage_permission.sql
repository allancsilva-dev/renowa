-- =============================================================================
-- Renowa — Migration 006: permissão de gestão de usuários
-- =============================================================================
-- Tabela permissions (002_local_permissions.sql): coluna `module` é NOT NULL
-- sem default — o INSERT precisa fornecê-la.
-- Role `admin` já faz bypass no PermissionGuard; o slug existe para conceder
-- a roles não-admin no futuro.

INSERT INTO permissions (slug, description, module)
VALUES ('users.manage', 'Gerenciar usuários do tenant', 'usuarios')
ON CONFLICT (slug) DO NOTHING;
