-- =============================================================================
-- Renowa — Migration 001: Schema inicial
-- Executar uma única vez no banco PostgreSQL
-- =============================================================================

-- =============================================================================
-- TRIGGER: atualiza updated_at automaticamente em todo UPDATE
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Macro para aplicar o trigger em cada tabela (copiar e ajustar o nome)
-- CREATE TRIGGER trg_<tabela>_updated_at
-- BEFORE UPDATE ON <tabela>
-- FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_usuarios_updated_at
  BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clientes_updated_at
  BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transportadoras_updated_at
  BEFORE UPDATE ON transportadoras FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fornecedores_updated_at
  BEFORE UPDATE ON fornecedores FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_produtos_updated_at
  BEFORE UPDATE ON produtos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_pedidos_updated_at
  BEFORE UPDATE ON pedidos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_itens_pedido_updated_at
  BEFORE UPDATE ON itens_pedido FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_financeiro_movimentacao_updated_at
  BEFORE UPDATE ON financeiro_movimentacao FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_comissoes_updated_at
  BEFORE UPDATE ON comissoes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_inadimplencia_updated_at
  BEFORE UPDATE ON inadimplencia FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SEQUENCE: numero_pedido global (não por tenant — tradeoff consciente)
-- CHANGELOG #14: sequência global evita complexidade de gerenciar por tenant
-- Constraint: UNIQUE(tenant_id, numero_pedido) garante isolamento
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS pedidos_numero_seq
  START 1
  INCREMENT 1
  NO CYCLE;

-- =============================================================================
-- ÍNDICES COMPOSTOS (tenant_id + campo)
-- Índices simples em uuid/updated_at são ineficientes em banco multi-tenant.
-- O PostgreSQL usa o índice composto quando o WHERE já filtra por tenant.
-- =============================================================================

-- usuarios
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant           ON usuarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_uuid      ON usuarios(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant_updated   ON usuarios(tenant_id, updated_at);

-- clientes
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_uuid      ON clientes(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_updated   ON clientes(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_deleted   ON clientes(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_clientes_transportadora   ON clientes(transportadora_id);

-- transportadoras
CREATE INDEX IF NOT EXISTS idx_transp_tenant_uuid        ON transportadoras(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_transp_tenant_updated     ON transportadoras(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_transp_tenant_deleted     ON transportadoras(tenant_id, deleted_at);

-- fornecedores
CREATE INDEX IF NOT EXISTS idx_fornec_tenant_uuid        ON fornecedores(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_fornec_tenant_updated     ON fornecedores(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_fornec_tenant_deleted     ON fornecedores(tenant_id, deleted_at);

-- produtos
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_uuid      ON produtos(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_updated   ON produtos(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant_deleted   ON produtos(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_produtos_fornecedor       ON produtos(fornecedor_id);

-- pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_uuid       ON pedidos(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_updated    ON pedidos(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_deleted    ON pedidos(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_numero     ON pedidos(tenant_id, numero_pedido);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_status     ON pedidos(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant_data       ON pedidos(tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente           ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_vendedor          ON pedidos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_fornecedor        ON pedidos(fornecedor_id);

-- itens_pedido
CREATE INDEX IF NOT EXISTS idx_itens_tenant_uuid         ON itens_pedido(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_itens_tenant_updated      ON itens_pedido(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_itens_tenant_deleted      ON itens_pedido(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_itens_pedido              ON itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_itens_produto             ON itens_pedido(produto_id);

-- financeiro_movimentacao
CREATE INDEX IF NOT EXISTS idx_finmov_tenant_uuid        ON financeiro_movimentacao(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_finmov_tenant_updated     ON financeiro_movimentacao(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_finmov_tenant_deleted     ON financeiro_movimentacao(tenant_id, deleted_at);

-- comissoes
CREATE INDEX IF NOT EXISTS idx_comissoes_tenant_uuid     ON comissoes(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_comissoes_tenant_updated  ON comissoes(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_comissoes_pedido          ON comissoes(pedido_id);

-- inadimplencia
CREATE INDEX IF NOT EXISTS idx_inadimpl_tenant_uuid      ON inadimplencia(tenant_id, uuid);
CREATE INDEX IF NOT EXISTS idx_inadimpl_tenant_updated   ON inadimplencia(tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_inadimpl_tenant_deleted   ON inadimplencia(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_inadimpl_cliente          ON inadimplencia(cliente_id);

-- =============================================================================
-- CONSTRAINTS únicas obrigatórias (se não geradas pelo TypeORM)
-- =============================================================================

-- Mesmo usuário pode existir em dois tenants — constraint composta é a correta
ALTER TABLE usuarios
  ADD CONSTRAINT IF NOT EXISTS uq_usuarios_tenant_uuid UNIQUE (tenant_id, uuid);

-- numero_pedido nunca UNIQUE simples em SaaS
ALTER TABLE pedidos
  ADD CONSTRAINT IF NOT EXISTS uq_pedidos_tenant_numero UNIQUE (tenant_id, numero_pedido);
