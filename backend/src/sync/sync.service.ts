import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import {
  SyncItemDto,
  SyncEntity,
  SyncOperation,
  SyncPullDto,
  SyncPullV2Dto,
  SyncPushV2Dto,
  SyncItemV2Dto,
} from './dto/sync.dto';
import { getSyncEntityPolicy, SyncEntityPolicy } from './sync-entity-policy';

export interface SyncItemResult {
  uuid: string;
  status: 'ok' | 'error';
  id?: number;
  numero_pedido?: number | null;
  message?: string;
}

/**
 * CHANGELOG #8: Sync por entidade — endpoints separados por tabela.
 * CHANGELOG #4: Transaction por item — falha em um item não afeta os demais.
 * CHANGELOG #12: server_time em todo response de sync.
 * CHANGELOG #3: UUID→ID resolution — mobile envia uuid, servidor resolve para id.
 * CHANGELOG #13: Cursor por offset (limitação conhecida — migrar para updated_at na v2.0).
 *
 * Estratégia LWW (Last Write Wins):
 * - UPDATE: se updated_at_banco > updated_at_recebido → descartar (banco é mais recente)
 * - Limitação: dois usuários editando o mesmo registro offline → o segundo sobrescreve tudo.
 *   Planejar field-level merge na v2.0.
 *
 * Idempotência:
 * - CREATE com UUID já existente → retornar registro atual (nunca duplicar)
 * - numero_pedido: gerado via nextval('pedidos_numero_seq') apenas na criação
 */
@Injectable()
export class SyncService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async pushItemsV2(dto: SyncPushV2Dto, tenantId: string): Promise<{
    sync_run_id?: string;
    results: SyncItemV2Result[];
  }> {
    const results: SyncItemV2Result[] = [];
    for (const item of dto.items) {
      results.push(await this.processIdempotentItemV2(item, dto.device_id, dto.sync_run_id, tenantId));
    }
    return { sync_run_id: dto.sync_run_id, results };
  }

  private async processIdempotentItemV2(
    item: SyncItemV2Dto,
    deviceId: string,
    syncRunId: string | undefined,
    tenantId: string,
  ): Promise<SyncItemV2Result> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${tenantId}:${deviceId}:${item.operation_id}`,
      ]);
      const cached = await qr.query(
        `SELECT result FROM public.sync_mutation_inbox
          WHERE tenant_id = $1 AND device_id = $2 AND operation_id = $3`,
        [tenantId, deviceId, item.operation_id],
      );
      if (cached[0]?.result) {
        await qr.commitTransaction();
        return cached[0].result as SyncItemV2Result;
      }

      let result: SyncItemV2Result;
      await qr.query('SAVEPOINT sync_item_v2');
      try {
        result = await this.processItemV2(qr, item, tenantId);
      } catch (error) {
        if (!(error instanceof BadRequestException) && !this.isPermanentMutationError(error)) throw error;
        await qr.query('ROLLBACK TO SAVEPOINT sync_item_v2');
        result = {
          operation_id: item.operation_id,
          uuid: item.uuid,
          status: 'rejected',
          code: 'VALIDATION_FAILED',
          retryable: false,
          message: error instanceof BadRequestException ? error.message : 'Mutação rejeitada pelo banco',
        };
      }

      await qr.query(
        `INSERT INTO public.sync_mutation_inbox
          (tenant_id, device_id, operation_id, sync_run_id, entity, entity_uuid, result)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [tenantId, deviceId, item.operation_id, syncRunId ?? null, item.entity, item.uuid, JSON.stringify(result)],
      );
      await qr.commitTransaction();
      return result;
    } catch {
      await qr.rollbackTransaction();
      return {
        operation_id: item.operation_id,
        uuid: item.uuid,
        status: 'retryable',
        code: 'TEMPORARY_FAILURE',
        retryable: true,
        message: 'Falha temporária ao processar mutação',
      };
    } finally {
      await qr.release();
    }
  }

  private async processItemV2(
    qr: QueryRunner,
    item: SyncItemV2Dto,
    tenantId: string,
  ): Promise<SyncItemV2Result> {
    const policy = getSyncEntityPolicy(item.entity);
    const table = this.quoteIdentifier(policy.table);
    this.validatePayload(item.entity, item.operation, item.payload, policy);
    if (item.operation === SyncOperation.UPDATE && Object.keys(item.payload).length === 0) {
      throw new BadRequestException('payload não pode ser vazio em UPDATE');
    }
    const existing = await qr.query(
      `SELECT * FROM ${table} WHERE uuid = $1 AND tenant_id = $2`,
      [item.uuid, tenantId],
    );

    if (item.operation === SyncOperation.CREATE) {
      if (existing.length > 0) {
        return {
          operation_id: item.operation_id, uuid: item.uuid, status: 'duplicate',
          code: 'ALREADY_EXISTS', retryable: false, version: Number(existing[0].version),
        };
      }
      const record = await this.buildWritableRecord(qr, item.entity, item.payload, tenantId, policy);
      if (item.entity === SyncEntity.PEDIDOS) {
        const sequence = await qr.query(`SELECT nextval('pedidos_numero_seq') AS numero`);
        record['numero_pedido'] = sequence[0].numero;
      }
      await this.insertRecord(qr, policy.table, item.uuid, tenantId, record);
      return {
        operation_id: item.operation_id, uuid: item.uuid, status: 'applied',
        code: 'APPLIED', retryable: false, version: 1,
      };
    }

    if (!item.base_version) {
      throw new BadRequestException('base_version é obrigatório para UPDATE e DELETE');
    }
    if (existing.length === 0) {
      return {
        operation_id: item.operation_id, uuid: item.uuid, status: 'conflict',
        code: 'NOT_FOUND', retryable: false,
      };
    }

    let changed: Array<{ version: number }> = [];
    if (item.operation === SyncOperation.DELETE) {
      changed = await qr.query(
        `UPDATE ${table} SET deleted_at = NOW(), version = version + 1
          WHERE uuid = $1 AND tenant_id = $2 AND version = $3 RETURNING version`,
        [item.uuid, tenantId, item.base_version],
      );
    } else {
      const record = await this.buildWritableRecord(qr, item.entity, item.payload, tenantId, policy);
      const columns = Object.keys(record);
      if (columns.length > 0) {
        const assignments = columns
          .map((column, index) => `${this.quoteIdentifier(column)} = $${index + 4}`)
          .concat('version = version + 1')
          .join(', ');
        changed = await qr.query(
          `UPDATE ${table} SET ${assignments}
            WHERE uuid = $1 AND tenant_id = $2 AND version = $3 RETURNING version`,
          [item.uuid, tenantId, item.base_version, ...columns.map((column) => record[column])],
        );
      }
    }

    if (changed.length > 0) {
      return {
        operation_id: item.operation_id, uuid: item.uuid, status: 'applied',
        code: 'APPLIED', retryable: false, version: Number(changed[0].version),
      };
    }
    const current = await qr.query(
      `SELECT version FROM ${table} WHERE uuid = $1 AND tenant_id = $2`,
      [item.uuid, tenantId],
    );
    return {
      operation_id: item.operation_id, uuid: item.uuid, status: 'conflict',
      code: 'VERSION_CONFLICT', retryable: false,
      version: current[0]?.version == null ? undefined : Number(current[0].version),
    };
  }

  private isPermanentMutationError(error: unknown): boolean {
    const typed = error as { code?: string; driverError?: { code?: string } } | null;
    const code = typed?.code ?? typed?.driverError?.code;
    return code != null && ['22P02', '23502', '23503', '23505', '23514'].includes(code);
  }

  // ── Helpers ──────────────────────────────────────────────

  /** UUID→ID resolution — resolve uuid para id interno (CHANGELOG #3) */
  private async resolveUuid(
    qr: QueryRunner,
    table: string,
    uuid: string,
    tenantId: string,
  ): Promise<number | null> {
    if (!uuid) return null;
    const rows = await qr.query(
      `SELECT id FROM ${this.quoteIdentifier(table)} WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [uuid, tenantId],
    );
    return (rows[0]?.id as number) ?? null;
  }

  // ── PUSH ─────────────────────────────────────────────────

  /**
   * Processa cada item em transação isolada (CHANGELOG #4).
   * Falha em um item não afeta os demais.
   */
  async pushItems(
    items: SyncItemDto[],
    tenantId: string,
  ): Promise<{ results: SyncItemResult[]; server_time: string }> {
    const results: SyncItemResult[] = [];

    for (const item of items) {
      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();

      try {
        const result = await this.processItem(qr, item, tenantId);
        await qr.commitTransaction();
        results.push({ uuid: item.uuid, status: 'ok', ...result });
      } catch (err) {
        await qr.rollbackTransaction();
        results.push({
          uuid: item.uuid,
          status: 'error',
          message: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      } finally {
        await qr.release();
      }
    }

    return { results, server_time: new Date().toISOString() };
  }

  private async processItem(
    qr: QueryRunner,
    item: SyncItemDto,
    tenantId: string,
  ): Promise<{ id?: number; numero_pedido?: number | null }> {
    const { entity, uuid, operation, payload, client_timestamp } = item;
    const policy = getSyncEntityPolicy(entity);
    const table = policy.table;

    this.validatePayload(entity, operation, payload, policy);

    // ── DELETE ──────────────────────────────────────────────
    if (operation === 'DELETE') {
      await qr.query(
        `UPDATE ${this.quoteIdentifier(table)} SET deleted_at = NOW() WHERE uuid = $1 AND tenant_id = $2`,
        [uuid, tenantId],
      );
      return {};
    }

    // ── Idempotência: verificar se já existe ─────────────────
    const existing = await qr.query(
      `SELECT id, updated_at${entity === SyncEntity.PEDIDOS ? ', numero_pedido' : ''} FROM ${this.quoteIdentifier(table)} WHERE uuid = $1 AND tenant_id = $2`,
      [uuid, tenantId],
    );

    if (existing.length > 0 && operation === 'CREATE') {
      // Idempotência — registro já existe, retornar sem duplicar
      const row = existing[0] as { id: number; numero_pedido?: number };
      return { id: row.id, numero_pedido: row.numero_pedido ?? null };
    }

    // ── UPDATE com LWW ───────────────────────────────────────
    if (existing.length > 0 && operation === 'UPDATE') {
      const row = existing[0] as { id: number; updated_at: string; numero_pedido?: number };

      if (client_timestamp && new Date(row.updated_at) > new Date(client_timestamp)) {
        // Banco é mais recente — descartar update do mobile (LWW)
        return { id: row.id, numero_pedido: row.numero_pedido ?? null };
      }

      // Aplicar update com UUID→ID resolution para FKs
      const resolved = await this.buildWritableRecord(qr, entity, payload, tenantId, policy);
      await this.updateRecord(qr, table, uuid, tenantId, resolved);

      return { id: row.id, numero_pedido: row.numero_pedido ?? null };
    }

    // ── CREATE ───────────────────────────────────────────────
    const resolved = await this.buildWritableRecord(qr, entity, payload, tenantId, policy);

    let numero_pedido: number | null = null;

    if (entity === SyncEntity.PEDIDOS) {
      // SEQUENCE global — NUNCA gerado no mobile (CHANGELOG #14)
      const seqResult = await qr.query(`SELECT nextval('pedidos_numero_seq') AS numero`);
      numero_pedido = seqResult[0].numero as number;
      resolved['numero_pedido'] = numero_pedido;
    }

    const id = await this.insertRecord(qr, table, uuid, tenantId, resolved);
    return { id, numero_pedido };
  }

  private async updateRecord(
    qr: QueryRunner,
    table: string,
    uuid: string,
    tenantId: string,
    record: Record<string, unknown>,
  ): Promise<void> {
    const columns = Object.keys(record);
    if (columns.length === 0) return;

    const assignments = columns
      .map((column, index) => `${this.quoteIdentifier(column)} = $${index + 3}`)
      .join(', ');
    await qr.query(
      `UPDATE ${this.quoteIdentifier(table)} SET ${assignments}, updated_at = NOW() WHERE uuid = $1 AND tenant_id = $2`,
      [uuid, tenantId, ...columns.map((column) => record[column])],
    );
  }

  private async insertRecord(
    qr: QueryRunner,
    table: string,
    uuid: string,
    tenantId: string,
    record: Record<string, unknown>,
  ): Promise<number> {
    const columns = ['uuid', 'tenant_id', ...Object.keys(record)];
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    const values = [uuid, tenantId, ...Object.values(record)];
    const rows = await qr.query(
      `INSERT INTO ${this.quoteIdentifier(table)} (${columns.map((column) => this.quoteIdentifier(column)).join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return rows[0]?.id as number;
  }

  private validatePayload(
    entity: SyncEntity,
    operation: SyncOperation,
    payload: Record<string, unknown>,
    policy: SyncEntityPolicy,
  ): void {
    const invalid = Object.keys(payload).filter(
      (field) => !policy.writableFields.includes(field)
        && !Object.prototype.hasOwnProperty.call(policy.foreignKeys, field),
    );

    if (invalid.length > 0) {
      throw new BadRequestException(`Campos não permitidos em ${entity}: ${invalid.join(', ')}`);
    }

    if (operation === SyncOperation.CREATE) {
      const missingRequiredFks = Object.entries(policy.foreignKeys)
        .filter(([, foreignKey]) => !foreignKey.nullable)
        .map(([field]) => field)
        .filter((field) => !Object.prototype.hasOwnProperty.call(payload, field));

      if (missingRequiredFks.length > 0) {
        throw new BadRequestException(
          `FKs obrigatórias ausentes em ${entity}: ${missingRequiredFks.join(', ')}`,
        );
      }
    }
  }

  /**
   * Resolve UUIDs de FKs no payload para IDs internos (CHANGELOG #3).
   * Ex: cliente_uuid → cliente_id, produto_uuid → produto_id
   */
  private async buildWritableRecord(
    qr: QueryRunner,
    entity: SyncEntity,
    payload: Record<string, unknown>,
    tenantId: string,
    policy: SyncEntityPolicy,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    for (const field of policy.writableFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) result[field] = payload[field];
    }

    for (const [uuidKey, foreignKey] of Object.entries(policy.foreignKeys)) {
      if (!Object.prototype.hasOwnProperty.call(payload, uuidKey)) continue;

      const uuid = payload[uuidKey];

      if (uuid === null) {
        if (!foreignKey.nullable) {
          throw new BadRequestException(`FK obrigatória não aceita null em ${entity}: ${uuidKey}`);
        }
        result[foreignKey.column] = null;
        continue;
      }

      if (typeof uuid !== 'string' || !isUUID(uuid)) {
        throw new BadRequestException(`FK inválida em ${entity}: ${uuidKey}`);
      }

      const id = await this.resolveUuid(qr, foreignKey.targetTable, uuid, tenantId);
      if (id === null) {
        throw new BadRequestException(`FK não encontrada em ${entity}: ${uuidKey}`);
      }
      result[foreignKey.column] = id;
    }

    return result;
  }

  private quoteIdentifier(identifier: string): string {
    if (!/^[a-z_]+$/.test(identifier)) {
      throw new Error(`Identificador SQL inválido na política de sync: ${identifier}`);
    }
    return `"${identifier}"`;
  }

  // ── PULL ─────────────────────────────────────────────────

  /**
   * Busca deltas por entidade desde `since`.
   * Inclui registros deletados (withDeleted) — mobile precisa saber o que remover.
   * CHANGELOG #8: endpoint separado por entidade.
   * CHANGELOG #12: server_time dentro de meta — mobile usa como próximo cursor.
   * CHANGELOG #13: cursor por offset (limitação documentada — migrar para keyset na v2.0).
   */
  async pullEntity<T extends object>(
    entityClass: new () => T,
    dto: SyncPullDto,
    tenantId: string,
  ): Promise<{
    data: T[];
    meta: { total: number; hasMore: boolean; nextCursor: number; server_time: string };
  }> {
    const repo = this.dataSource.getRepository(entityClass);
    const { since, cursor = 0, limit = 200 } = dto;

    const qb = repo
      .createQueryBuilder('e')
      .withDeleted()
      .where('e.tenant_id = :tenantId', { tenantId });

    if (since) {
      qb.andWhere('e.updated_at > :since', { since });
    }

    const [data, total] = await qb
      .orderBy('e.updated_at', 'ASC')
      .skip(cursor)
      .take(limit)
      .getManyAndCount();

    const hasMore = cursor + limit < total;

    return {
      data,
      meta: {
        total,
        hasMore,
        nextCursor: hasMore ? cursor + limit : cursor,
        server_time: new Date().toISOString(),
      },
    };
  }

  async pullEntityV2(entity: SyncEntity, dto: SyncPullV2Dto, tenantId: string): Promise<{
    data: Array<{ revision: string; operation: 'UPSERT' | 'DELETE'; payload: Record<string, unknown> }>;
    meta: { hasMore: boolean; nextCursor: string; highWatermark: string };
  }> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT public.drain_sync_outbox()');

      let highWatermark = dto.highWatermark;
      if (!highWatermark) {
        const rows = await manager.query(
          `SELECT COALESCE(MAX(revision), 0)::text AS value
             FROM public.sync_changes WHERE tenant_id = $1 AND entity = $2`,
          [tenantId, entity],
        );
        highWatermark = String(rows[0]?.value ?? '0');
      }

      const rows = await manager.query(
        `SELECT revision::text, operation, payload
           FROM public.sync_changes
          WHERE tenant_id = $1 AND entity = $2
            AND revision > $3::bigint AND revision <= $4::bigint
          ORDER BY revision ASC LIMIT $5`,
        [tenantId, entity, dto.cursor, highWatermark, dto.limit + 1],
      ) as Array<{ revision: string; operation: 'UPSERT' | 'DELETE'; payload: Record<string, unknown> }>;

      const hasMore = rows.length > dto.limit;
      const data = hasMore ? rows.slice(0, dto.limit) : rows;
      return {
        data,
        meta: {
          hasMore,
          nextCursor: data.at(-1)?.revision ?? dto.cursor,
          highWatermark,
        },
      };
    });
  }
}

export type SyncV2Status = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'retryable';

export interface SyncItemV2Result {
  operation_id: string;
  uuid: string;
  status: SyncV2Status;
  code: string;
  retryable: boolean;
  version?: number;
  message?: string;
}
