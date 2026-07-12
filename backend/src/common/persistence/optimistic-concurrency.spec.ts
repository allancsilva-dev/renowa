import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { VersionedBaseEntity } from '../entities/versioned-base.entity';
import { ConcurrentModificationException } from '../errors/concurrent-modification.exception';
import { optimisticSoftDelete, optimisticUpdate } from './optimistic-concurrency';

class TestRecord extends VersionedBaseEntity {
  name: string;
}

function queryBuilder(overrides: Record<string, jest.Mock> = {}) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['select', 'where', 'andWhere', 'update', 'set', 'returning']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  return Object.assign(builder, overrides);
}

function repository(updateBuilder: object, lookupBuilder: object): Repository<TestRecord> {
  return {
    createQueryBuilder: jest.fn((alias?: string) => (alias ? lookupBuilder : updateBuilder)),
  } as unknown as Repository<TestRecord>;
}

const baseOptions = {
  uuid: '8ef56520-e451-4492-a5b9-9b3609d831a8',
  tenantId: '99c78197-3701-4e23-ab36-3ae34f268cc5',
  expectedVersion: 3,
  resource: 'test-record',
  notFoundMessage: 'Registro não encontrado.',
};

describe('optimistic concurrency', () => {
  it('updates and increments version in one conditional statement', async () => {
    const saved = { ...baseOptions, name: 'novo', version: 4 };
    const updateBuilder = queryBuilder({
      execute: jest.fn().mockResolvedValue({ affected: 1, raw: [saved] }),
    });
    const repo = repository(updateBuilder, queryBuilder());

    await expect(
      optimisticUpdate({ ...baseOptions, repository: repo, patch: { name: 'novo' } }),
    ).resolves.toEqual(saved);

    expect(updateBuilder.andWhere).toHaveBeenCalledWith(
      'version = :expectedVersion',
      { expectedVersion: 3 },
    );
    const set = updateBuilder.set.mock.calls[0][0];
    expect(set.version()).toContain('version');
    expect(set.version()).toContain('+ 1');
  });

  it('returns structured conflict when current version changed', async () => {
    const updateBuilder = queryBuilder({
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    });
    const lookupBuilder = queryBuilder({
      getRawOne: jest.fn().mockResolvedValue({ version: 4 }),
    });
    const repo = repository(updateBuilder, lookupBuilder);

    const promise = optimisticUpdate({
      ...baseOptions,
      repository: repo,
      patch: { name: 'novo' },
    });

    await expect(promise).rejects.toBeInstanceOf(ConcurrentModificationException);
    await expect(promise).rejects.toMatchObject({
      response: {
        code: 'CONCURRENT_MODIFICATION',
        expectedVersion: 3,
        currentVersion: 4,
      },
    });
  });

  it('returns not found without exposing another tenant record', async () => {
    const updateBuilder = queryBuilder({
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    });
    const lookupBuilder = queryBuilder({
      getRawOne: jest.fn().mockResolvedValue(undefined),
    });
    const repo = repository(updateBuilder, lookupBuilder);

    await expect(
      optimisticUpdate({ ...baseOptions, repository: repo, patch: { name: 'novo' } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('soft deletes with matching version and increments it', async () => {
    const updateBuilder = queryBuilder({
      execute: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    });
    const repo = repository(updateBuilder, queryBuilder());

    await expect(optimisticSoftDelete({ ...baseOptions, repository: repo })).resolves.toBeUndefined();

    const set = updateBuilder.set.mock.calls[0][0];
    expect(set.deleted_at()).toBe('CURRENT_TIMESTAMP');
    expect(set.version()).toContain('version');
    expect(set.version()).toContain('+ 1');
  });
});
