import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('renowa.db');
    await initSchema(db);
  }
  return db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Fornecedores
    CREATE TABLE IF NOT EXISTS fornecedores (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid         TEXT NOT NULL UNIQUE,
      tenant_id    TEXT NOT NULL,
      razao_social TEXT NOT NULL,
      cnpj         TEXT,
      updated_at   TEXT,
      deleted_at   TEXT,
      synced       INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_fornecedores_uuid       ON fornecedores(uuid);
    CREATE INDEX IF NOT EXISTS idx_fornecedores_updated_at ON fornecedores(updated_at);

    -- Transportadoras
    CREATE TABLE IF NOT EXISTS transportadoras (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid              TEXT NOT NULL UNIQUE,
      tenant_id         TEXT NOT NULL,
      razao_social      TEXT NOT NULL,
      cnpj              TEXT,
      telefone          TEXT,
      endereco_completo TEXT,
      updated_at        TEXT,
      deleted_at        TEXT,
      synced            INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_transportadoras_uuid       ON transportadoras(uuid);
    CREATE INDEX IF NOT EXISTS idx_transportadoras_updated_at ON transportadoras(updated_at);

    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid                TEXT NOT NULL UNIQUE,
      tenant_id           TEXT NOT NULL,
      razao_social        TEXT NOT NULL,
      cnpj                TEXT,
      email               TEXT,
      tel                 TEXT,
      endereco            TEXT,
      bairro              TEXT,
      cidade              TEXT,
      uf                  TEXT,
      cep                 TEXT,
      contato             TEXT,
      inscricao_estadual  TEXT,
      suframa             TEXT,
      pgt_padrao          TEXT,
      prazo               TEXT,
      local_entrega       TEXT,
      observacao          TEXT,
      transportadora_uuid TEXT,
      updated_at          TEXT,
      deleted_at          TEXT,
      synced              INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_clientes_uuid       ON clientes(uuid);
    CREATE INDEX IF NOT EXISTS idx_clientes_updated_at ON clientes(updated_at);

    -- Produtos
    CREATE TABLE IF NOT EXISTS produtos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid           TEXT NOT NULL UNIQUE,
      tenant_id      TEXT NOT NULL,
      fornecedor_uuid TEXT,
      codigo         TEXT,
      descricao      TEXT NOT NULL,
      preco_base     REAL,
      updated_at     TEXT,
      deleted_at     TEXT,
      synced         INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_produtos_uuid       ON produtos(uuid);
    CREATE INDEX IF NOT EXISTS idx_produtos_updated_at ON produtos(updated_at);

    -- Pedidos
    -- numero_pedido é NULL até o servidor atribuir via SEQUENCE
    CREATE TABLE IF NOT EXISTS pedidos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid              TEXT NOT NULL UNIQUE,
      tenant_id         TEXT NOT NULL,
      numero_pedido     INTEGER,
      cliente_uuid      TEXT,
      vendedor_uuid     TEXT,
      fornecedor_uuid   TEXT,
      transportadora_uuid TEXT,
      data              TEXT,
      status            TEXT NOT NULL DEFAULT 'em_aberto',
      total_sem_imposto REAL,
      total_com_imposto REAL,
      pgt               TEXT,
      prazo             TEXT,
      local_entrega     TEXT,
      observacao        TEXT,
      updated_at        TEXT,
      deleted_at        TEXT,
      synced            INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_pedidos_uuid       ON pedidos(uuid);
    CREATE INDEX IF NOT EXISTS idx_pedidos_updated_at ON pedidos(updated_at);
    CREATE INDEX IF NOT EXISTS idx_pedidos_status     ON pedidos(status);

    -- Itens de pedido
    CREATE TABLE IF NOT EXISTS itens_pedido (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid             TEXT NOT NULL UNIQUE,
      tenant_id        TEXT NOT NULL,
      pedido_uuid      TEXT NOT NULL,
      produto_uuid     TEXT,
      codigo_manual    TEXT,
      descricao_manual TEXT,
      qtd_caixas       REAL,
      qtd_unitaria     REAL,
      preco_unitario   REAL,
      desconto_perc    REAL,
      total_item       REAL,
      updated_at       TEXT,
      deleted_at       TEXT,
      synced           INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_itens_uuid       ON itens_pedido(uuid);
    CREATE INDEX IF NOT EXISTS idx_itens_pedido     ON itens_pedido(pedido_uuid);
    CREATE INDEX IF NOT EXISTS idx_itens_updated_at ON itens_pedido(updated_at);

    -- Fila de sincronização (operações offline pendentes)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid             TEXT NOT NULL,
      entity           TEXT NOT NULL,
      operation        TEXT NOT NULL,
      payload          TEXT NOT NULL,
      client_timestamp TEXT NOT NULL,
      retry_count      INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Metadados de sincronização
    -- chave 'last_sync_timestamp' armazena o server_time do último pull bem-sucedido.
    -- Mobile NUNCA usa new Date() do dispositivo como cursor — apenas server_time.
    CREATE TABLE IF NOT EXISTS sync_meta (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT UNIQUE NOT NULL,
      valor TEXT
    );
    INSERT OR IGNORE INTO sync_meta (chave, valor) VALUES ('last_sync_timestamp', NULL);
  `);
}
