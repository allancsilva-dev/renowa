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

    -- Clientes
    CREATE TABLE IF NOT EXISTS clientes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid        TEXT NOT NULL UNIQUE,
      tenant_id   TEXT NOT NULL,
      razao_social TEXT NOT NULL,
      nome_fantasia TEXT,
      cnpj_cpf    TEXT,
      email       TEXT,
      telefone    TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT,
      synced      INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_clientes_uuid ON clientes(uuid);
    CREATE INDEX IF NOT EXISTS idx_clientes_updated_at ON clientes(updated_at);

    -- Produtos
    CREATE TABLE IF NOT EXISTS produtos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid        TEXT NOT NULL UNIQUE,
      tenant_id   TEXT NOT NULL,
      codigo      TEXT,
      descricao   TEXT NOT NULL,
      unidade     TEXT NOT NULL DEFAULT 'UN',
      preco_venda REAL NOT NULL,
      preco_custo REAL,
      estoque_atual REAL NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT,
      synced      INTEGER NOT NULL DEFAULT 1
    );

    -- Pedidos
    CREATE TABLE IF NOT EXISTS pedidos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid            TEXT NOT NULL UNIQUE,
      tenant_id       TEXT NOT NULL,
      numero_pedido   INTEGER,
      cliente_uuid    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'RASCUNHO',
      data_pedido     TEXT NOT NULL,
      valor_total     REAL NOT NULL DEFAULT 0,
      desconto_total  REAL NOT NULL DEFAULT 0,
      observacoes     TEXT,
      updated_at      TEXT NOT NULL,
      deleted_at      TEXT,
      synced          INTEGER NOT NULL DEFAULT 1
    );

    -- Fila de sincronização (operações offline pendentes)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid          TEXT NOT NULL,
      entity        TEXT NOT NULL,
      operation     TEXT NOT NULL,
      payload       TEXT NOT NULL,
      client_timestamp TEXT NOT NULL,
      retry_count   INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
