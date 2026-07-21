import { NotFoundException } from '@nestjs/common';
import { ObjectLiteral, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { VersionedBaseEntity } from '../entities/versioned-base.entity';
import { ConcurrentModificationException } from '../errors/concurrent-modification.exception';

type VersionedRecord = VersionedBaseEntity & ObjectLiteral;

/**
 * Condição adicional (raw SQL + params) aplicada tanto na escrita condicional
 * quanto na checagem de existência que decide entre 404 e 409. Usada para
 * restringir ownership (ex.: vendedor só enxerga os próprios pedidos) sem
 * vazar a existência do registro em outro escopo — retorna 404, não 403.
 */
interface ExtraWhere {
  sql: string;
  params: ObjectLiteral;
}

interface OptimisticWriteOptions<T extends VersionedRecord> {
  repository: Repository<T>;
  uuid: string;
  tenantId: string;
  expectedVersion: number;
  resource: string;
  notFoundMessage: string;
  patch: QueryDeepPartialEntity<T>;
  extraWhere?: ExtraWhere;
}

async function throwWriteFailure<T extends VersionedRecord>(
  options: Omit<OptimisticWriteOptions<T>, 'patch'>,
): Promise<never> {
  const query = options.repository
    .createQueryBuilder('record')
    .select('record.version', 'version')
    .where('record.uuid = :uuid', { uuid: options.uuid })
    .andWhere('record.tenant_id = :tenantId', { tenantId: options.tenantId })
    .andWhere('record.deleted_at IS NULL');

  if (options.extraWhere) {
    query.andWhere(options.extraWhere.sql, options.extraWhere.params);
  }

  const current = await query.getRawOne<{ version: number }>();

  if (!current) throw new NotFoundException(options.notFoundMessage);

  throw new ConcurrentModificationException(
    options.resource,
    options.uuid,
    options.expectedVersion,
    Number(current.version),
  );
}

export async function optimisticUpdate<T extends VersionedRecord>(
  options: OptimisticWriteOptions<T>,
): Promise<T> {
  const query = options.repository
    .createQueryBuilder()
    .update()
    .set({
      ...options.patch,
      version: () => '"version" + 1',
    } as QueryDeepPartialEntity<T>)
    .where('uuid = :uuid', { uuid: options.uuid })
    .andWhere('tenant_id = :tenantId', { tenantId: options.tenantId })
    .andWhere('version = :expectedVersion', { expectedVersion: options.expectedVersion })
    .andWhere('deleted_at IS NULL');

  if (options.extraWhere) {
    query.andWhere(options.extraWhere.sql, options.extraWhere.params);
  }

  const result = await query.returning('*').execute();

  if (!result.affected) await throwWriteFailure(options);
  return result.raw[0] as T;
}

export async function optimisticSoftDelete<T extends VersionedRecord>(
  options: Omit<OptimisticWriteOptions<T>, 'patch'>,
): Promise<void> {
  const query = options.repository
    .createQueryBuilder()
    .update()
    .set({
      deleted_at: () => 'CURRENT_TIMESTAMP',
      version: () => '"version" + 1',
    } as QueryDeepPartialEntity<T>)
    .where('uuid = :uuid', { uuid: options.uuid })
    .andWhere('tenant_id = :tenantId', { tenantId: options.tenantId })
    .andWhere('version = :expectedVersion', { expectedVersion: options.expectedVersion })
    .andWhere('deleted_at IS NULL');

  if (options.extraWhere) {
    query.andWhere(options.extraWhere.sql, options.extraWhere.params);
  }

  const result = await query.execute();

  if (!result.affected) await throwWriteFailure(options);
}
