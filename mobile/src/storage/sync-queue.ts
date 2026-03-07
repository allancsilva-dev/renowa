import { getDatabase } from './database';

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncEntity = 'clientes' | 'pedidos' | 'produtos' | 'fornecedores' | 'transportadoras';

export interface QueueItem {
  id: number;
  uuid: string;
  entity: SyncEntity;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  client_timestamp: string;
  retry_count: number;
}

export async function enqueue(
  uuid: string,
  entity: SyncEntity,
  operation: SyncOperation,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO sync_queue (uuid, entity, operation, payload, client_timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid, entity, operation, JSON.stringify(payload), new Date().toISOString()],
  );
}

export async function dequeue(limit = 200): Promise<QueueItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    uuid: string;
    entity: string;
    operation: string;
    payload: string;
    client_timestamp: string;
    retry_count: number;
  }>(
    `SELECT * FROM sync_queue ORDER BY id ASC LIMIT ?`,
    [limit],
  );

  return rows.map((r) => ({
    ...r,
    entity: r.entity as SyncEntity,
    operation: r.operation as SyncOperation,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  }));
}

export async function removeFromQueue(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, ids);
}

export async function incrementRetry(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sync_queue SET retry_count = retry_count + 1 WHERE id = ?`,
    [id],
  );
}

export async function getPendingCount(): Promise<number> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sync_queue`,
  );
  return result?.count ?? 0;
}
