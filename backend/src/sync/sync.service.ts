import { Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { SyncItemDto, SyncEntity, SyncPullDto } from './dto/sync.dto';

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
      `SELECT id FROM ${table} WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
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
    const table = entity as string;

    // ── DELETE ──────────────────────────────────────────────
    if (operation === 'DELETE') {
      await qr.query(
        `UPDATE ${table} SET deleted_at = NOW() WHERE uuid = $1 AND tenant_id = $2`,
        [uuid, tenantId],
      );
      return {};
    }

    // ── Idempotência: verificar se já existe ─────────────────
    const existing = await qr.query(
      `SELECT id, updated_at${entity === SyncEntity.PEDIDOS ? ', numero_pedido' : ''} FROM ${table} WHERE uuid = $1 AND tenant_id = $2`,
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
      const resolved = await this.resolvePayloadFKs(qr, entity, payload, tenantId);
      const fields = Object.keys(resolved)
        .filter((k) => !['id', 'uuid', 'tenant_id'].includes(k))
        .map((k, i) => `"${k}" = $${i + 3}`)
        .join(', ');

      if (fields) {
        const values = Object.keys(resolved)
          .filter((k) => !['id', 'uuid', 'tenant_id'].includes(k))
          .map((k) => resolved[k]);

        await qr.query(
          `UPDATE ${table} SET ${fields}, updated_at = NOW() WHERE uuid = $1 AND tenant_id = $2`,
          [uuid, tenantId, ...values],
        );
      }

      return { id: row.id, numero_pedido: row.numero_pedido ?? null };
    }

    // ── CREATE ───────────────────────────────────────────────
    const resolved = await this.resolvePayloadFKs(qr, entity, payload, tenantId);

    // Remove campos que o servidor controla
    delete resolved['id'];
    delete resolved['tenant_id'];

    let numero_pedido: number | null = null;

    if (entity === SyncEntity.PEDIDOS) {
      // SEQUENCE global — NUNCA gerado no mobile (CHANGELOG #14)
      const seqResult = await qr.query(`SELECT nextval('pedidos_numero_seq') AS numero`);
      numero_pedido = seqResult[0].numero as number;
      resolved['numero_pedido'] = numero_pedido;
    }

    const keys = ['uuid', 'tenant_id', ...Object.keys(resolved)];
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = [uuid, tenantId, ...Object.values(resolved)];

    const insertResult = await qr.query(
      `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values,
    );

    return { id: insertResult[0]?.id as number, numero_pedido };
  }

  /**
   * Resolve UUIDs de FKs no payload para IDs internos (CHANGELOG #3).
   * Ex: cliente_uuid → cliente_id, produto_uuid → produto_id
   */
  private async resolvePayloadFKs(
    qr: QueryRunner,
    entity: SyncEntity,
    payload: Record<string, unknown>,
    tenantId: string,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = { ...payload };

    const uuidFkMap: Record<SyncEntity, Record<string, string>> = {
      [SyncEntity.CLIENTES]: { transportadora_uuid: 'transportadora_id' },
      [SyncEntity.PEDIDOS]: {
        cliente_uuid: 'cliente_id',
        vendedor_uuid: 'vendedor_id',
        fornecedor_uuid: 'fornecedor_id',
        transportadora_uuid: 'transportadora_id',
      },
      [SyncEntity.PRODUTOS]: { fornecedor_uuid: 'fornecedor_id' },
      [SyncEntity.FORNECEDORES]: {},
      [SyncEntity.TRANSPORTADORAS]: {},
    };

    const tableMap: Record<string, string> = {
      transportadora_uuid: 'transportadoras',
      cliente_uuid: 'clientes',
      vendedor_uuid: 'usuarios',
      fornecedor_uuid: 'fornecedores',
    };

    const fkMap = uuidFkMap[entity] ?? {};

    for (const [uuidKey, idKey] of Object.entries(fkMap)) {
      if (result[uuidKey]) {
        const table = tableMap[uuidKey];
        const id = await this.resolveUuid(qr, table, result[uuidKey] as string, tenantId);
        result[idKey] = id;
        delete result[uuidKey];
      }
    }

    // Remover campos uuid de FK que sobram no payload (sem mapeamento configurado)
    for (const key of Object.keys(result)) {
      if (key.endsWith('_uuid') && key !== 'uuid') {
        delete result[key];
      }
    }

    return result;
  }

  // ── PULL ─────────────────────────────────────────────────

  /**
   * Busca deltas por entidade desde `since`.
   * Inclui registros deletados (withDeleted) — mobile precisa saber o que remover.
   * CHANGELOG #8: endpoint separado por entidade.
   * CHANGELOG #12: server_time retornado — mobile usa como próximo cursor.
   * CHANGELOG #13: cursor por offset (limitação documentada).
   */
  async pullEntity<T extends object>(
    entityClass: new () => T,
    dto: SyncPullDto,
    tenantId: string,
  ): Promise<{
    data: T[];
    meta: { total: number; page: number; limit: number; hasMore: boolean };
    server_time: string;
  }> {
    const repo = this.dataSource.getRepository(entityClass);
    const { since, page = 1, limit = 100 } = dto;

    const qb = repo
      .createQueryBuilder('e')
      .withDeleted()
      .where('e.tenant_id = :tenantId', { tenantId });

    if (since) {
      qb.andWhere('e.updated_at > :since', { since });
    }

    const [data, total] = await qb
      .orderBy('e.updated_at', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { total, page, limit, hasMore: page * limit < total },
      server_time: new Date().toISOString(),
    };
  }
}
