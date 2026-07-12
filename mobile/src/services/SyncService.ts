import NetInfo from '@react-native-community/netinfo';
import { apiService } from './ApiService';
import {
  dequeue,
  removeFromQueue,
  incrementRetry,
  getPendingCount,
  type QueueItem,
} from '../storage/sync-queue';
import { getDatabase } from '../storage/database';

function sqliteValue(value: unknown): string | number | null | Uint8Array {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

const SYNC_ENTITIES = [
  'clientes',
  'produtos',
  'transportadoras',
  'fornecedores',
  'pedidos',
  'itens_pedido',
] as const;

type SyncEntityName = (typeof SYNC_ENTITIES)[number];

interface SyncResult {
  uuid: string;
  status: 'ok' | 'error';
  error?: string;
}

/**
 * CHANGELOG #12: server_time está dentro de meta — não no topo do response.
 * Mobile usa meta.server_time como âncora, NUNCA new Date() do dispositivo.
 */
interface PullMetaV2 {
  hasMore: boolean;
  nextCursor: string;
  highWatermark: string;
}

interface PullChange {
  revision: string;
  operation: 'UPSERT' | 'DELETE';
  payload: Record<string, unknown>;
}

interface PullResponseV2 {
  data: PullChange[];
  meta: PullMetaV2;
}

interface PullResponse<T> {
  data: T[];
  meta: { total: number; hasMore: boolean; nextCursor: number; server_time: string };
}

/** Mapa: nome do endpoint → nome da tabela SQLite */
const ENTITY_TABLE: Record<SyncEntityName, string> = {
  'clientes': 'clientes',
  'produtos': 'produtos',
  'transportadoras': 'transportadoras',
  'fornecedores': 'fornecedores',
  'pedidos': 'pedidos',
  'itens_pedido': 'itens_pedido',
};

/**
 * SyncService — gerencia sincronização bidirecional com o servidor.
 *
 * FLUXO:
 * 1. syncPendingItems() — envia queue local para POST /api/sync (lotes de 200)
 * 2. fetchDeltas() — busca atualizações por entidade desde last_sync_timestamp
 *
 * CHANGELOG #3: UUID→ID resolution — mobile sempre opera por uuid localmente.
 * CHANGELOG #8: Sync por entidade — um GET por tabela.
 * CHANGELOG #12: server_time como âncora — NUNCA usar new Date() do dispositivo.
 * CHANGELOG #13: cursor por offset numérico (0, 200, 400...).
 */
export class SyncService {
  /**
   * Sincroniza items pendentes da queue local com o servidor.
   * Retry com backoff exponencial: 1s, 2s, 4s (máx 3 tentativas).
   * Chamado automaticamente ao recuperar conexão.
   */
  async syncPendingItems(): Promise<{ ok: number; errors: number }> {
    const isConnected = await this.isOnline();
    if (!isConnected) return { ok: 0, errors: 0 };

    const pendingCount = await getPendingCount();
    if (pendingCount === 0) return { ok: 0, errors: 0 };

    // CHANGELOG #11: limite 200 items por batch
    const items = await dequeue(200);
    if (items.length === 0) return { ok: 0, errors: 0 };

    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < MAX_RETRIES) {
      try {
        const { data } = await apiService.post<{ results: SyncResult[] }>('/sync', {
          items: items.map((item) => ({
            uuid: item.uuid,
            entity: item.entity,
            operation: item.operation,
            payload: item.payload,
            client_timestamp: item.client_timestamp,
          })),
        });

        const okIds: number[] = [];
        const errorIds: number[] = [];

        for (let i = 0; i < data.results.length; i++) {
          const result = data.results[i];
          const queueItem = items[i] as QueueItem;

          if (result.status === 'ok') {
            okIds.push(queueItem.id);
          } else {
            errorIds.push(queueItem.id);
            await incrementRetry(queueItem.id);
          }
        }

        await removeFromQueue(okIds);
        return { ok: okIds.length, errors: errorIds.length };
      } catch (err) {
        lastError = err;
        attempt++;
        if (attempt < MAX_RETRIES) {
          // Backoff exponencial: 1s, 2s, 4s
          await sleep(1000 * Math.pow(2, attempt - 1));
        }
      }
    }

    console.warn('[SyncService] syncPendingItems falhou após 3 tentativas:', lastError);
    return { ok: 0, errors: items.length };
  }

  /**
   * Busca deltas do servidor por entidade.
   * CHANGELOG #8: endpoint separado por entidade.
   * CHANGELOG #12: usa meta.server_time como âncora, nunca Date.now() do dispositivo.
   * CHANGELOG #13: cursor por offset — 0, 200, 400...
   *
   * Full Sync (first install): chamar com since = '1970-01-01T00:00:00.000Z'
   * Delta Sync: chamar com since = last_sync_timestamp salvo
   */
  async fetchDeltas(since?: string): Promise<string> {
    const isConnected = await this.isOnline();
    if (!isConnected) return since ?? '';

    let latestServerTime = since ?? '';

    for (const entity of SYNC_ENTITIES) {
      const table = ENTITY_TABLE[entity];
      let cursor = 0;
      let hasMore = true;

      while (hasMore) {
        try {
          const { data } = await apiService.get<PullResponse<Record<string, unknown>>>(
            `/sync/${entity}`,
            { params: { since, cursor, limit: 200 } },
          );

          await this.applyDeltas(table, data.data);

          hasMore = data.meta.hasMore;
          cursor = data.meta.nextCursor;

          // CHANGELOG #12: server_time como âncora — atualizar a cada página
          if (data.meta.server_time > latestServerTime) {
            latestServerTime = data.meta.server_time;
          }
        } catch {
          // Para este entity e continua com o próximo
          hasMore = false;
        }
      }
    }

    return latestServerTime;
  }

  private async getEntityCursor(entity: SyncEntityName): Promise<string> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ valor: string }>(
      'SELECT valor FROM sync_meta WHERE chave = ?', [`sync_v2_cursor:${entity}`],
    );
    return row?.valor ?? '0';
  }

  private async fetchDeltasV2(): Promise<string> {
    if (!(await this.isOnline())) return '';
    for (const entity of SYNC_ENTITIES) {
      const table = ENTITY_TABLE[entity];
      let cursor = await this.getEntityCursor(entity);
      let highWatermark: string | undefined;
      let hasMore = true;
      while (hasMore) {
        try {
          const { data } = await apiService.get<PullResponseV2>(`/sync/v2/${entity}`, {
            params: { cursor, highWatermark, limit: 200 },
          });
          highWatermark = data.meta.highWatermark;
          await this.applyPage(table, entity, data.data, data.meta.nextCursor);
          cursor = data.meta.nextCursor;
          hasMore = data.meta.hasMore;
        } catch {
          hasMore = false;
        }
      }
    }
    return new Date().toISOString();
  }

  private async applyPage(table: string, entity: SyncEntityName, changes: PullChange[], nextCursor: string): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      const allowed = new Set(columns.map((column) => column.name));
      for (const change of changes) {
        const row = change.payload;
        const uuid = row['uuid'] as string;
        if (change.operation === 'DELETE') {
          await db.runAsync(`UPDATE ${table} SET deleted_at = ? WHERE uuid = ?`, [sqliteValue(row['deleted_at'] ?? '1970-01-01T00:00:00.000Z'), uuid]);
          continue;
        }
        const existing = await db.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE uuid = ?`, [uuid]);
        if (existing) {
          const keys = Object.keys(row).filter((key) => key !== 'uuid' && allowed.has(key));
          if (keys.length) await db.runAsync(
            `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')}, synced = 1 WHERE uuid = ?`,
            [...keys.map((key) => sqliteValue(row[key])), uuid],
          );
        } else {
          const keys = Object.keys(row).filter((key) => key !== 'id' && allowed.has(key));
          await db.runAsync(
            `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}, synced) VALUES (${keys.map(() => '?').join(', ')}, 1)`,
            keys.map((key) => sqliteValue(row[key])),
          );
        }
      }
      await db.runAsync(
        `INSERT INTO sync_meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [`sync_v2_cursor:${entity}`, nextCursor],
      );
    });
  }

  private async applyDeltas(
    table: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    if (rows.length === 0) return;

    const db = await getDatabase();

    for (const row of rows) {
      const uuid = row['uuid'] as string;
      const deletedAt = row['deleted_at'] as string | null;

      if (deletedAt) {
        // Soft delete local — marcar como deletado
        await db.runAsync(
          `UPDATE ${table} SET deleted_at = ? WHERE uuid = ?`,
          [deletedAt, uuid],
        );
        continue;
      }

      // Upsert: tenta atualizar, se não existir insere
      const existing = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM ${table} WHERE uuid = ?`,
        [uuid],
      );

      if (existing) {
        // Atualizar todos os campos do servidor (LWW — servidor vence no pull)
        const keys = Object.keys(row).filter((k) => !['id', 'uuid'].includes(k));
        if (keys.length > 0) {
          const setClauses = keys.map((k) => `${k} = ?`).join(', ');
          const values = keys.map((k) => sqliteValue(row[k]));
          await db.runAsync(
            `UPDATE ${table} SET ${setClauses}, synced = 1 WHERE uuid = ?`,
            [...values, uuid],
          );
        }
      } else {
        // Inserir nova linha vinda do servidor
        const keys = Object.keys(row).filter((k) => k !== 'id');
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((k) => sqliteValue(row[k]));

        await db.runAsync(
          `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}, synced) VALUES (${placeholders}, 1)`,
          values,
        );
      }
    }
  }

  /**
   * Ciclo completo de sincronização:
   * 1. Envia pendentes (push)
   * 2. Busca deltas por entidade (pull)
   * 3. Salva novo cursor (server_time) — NUNCA new Date() do dispositivo
   */
  async runFullSync(): Promise<void> {
    const pushResult = await this.syncPendingItems();

    const lastSync = await apiService.getLastSyncTimestamp();
    // Full sync no primeiro uso — epoch retorna tudo do servidor
    const since = lastSync ?? '1970-01-01T00:00:00.000Z';
    const newCursor = await this.fetchDeltasV2();

    if (newCursor) {
      await apiService.setLastSyncTimestamp(newCursor);
    }

    console.log(`[SyncService] Push: ${pushResult.ok} ok, ${pushResult.errors} errors`);
  }

  private async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable !== false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const syncService = new SyncService();
