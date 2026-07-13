import 'reflect-metadata';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Permission } from './permission.entity';
import { LgpdRequest } from '../../privacy/entities/lgpd-request.entity';
import { LocalUser } from '../../rbac/entities/local-user.entity';
import { TenantRole } from '../../rbac/entities/tenant-role.entity';

describe('temporal persistence contract', () => {
  it.each([
    [BaseEntity, 'updated_at'],
    [Permission, 'updated_at'],
    [LocalUser, 'updatedAt'],
    [TenantRole, 'updatedAt'],
    [LgpdRequest, 'updated_at'],
  ])('keeps %p.%s as a database-managed timestamptz', (target, propertyName) => {
    const column = getMetadataArgsStorage().columns.find(
      (metadata) => metadata.target === target && metadata.propertyName === propertyName,
    );

    expect(column).toBeDefined();
    expect(column?.mode).toBe('regular');
    expect(column?.options).toMatchObject({
      type: 'timestamptz',
      insert: false,
      update: false,
    });
  });

  it('converts legacy values as UTC and installs database-authoritative triggers', () => {
    const sql = readFileSync(
      join(__dirname, '../../database/migrations/0020_utc_timestamps_db_authority.sql'),
      'utf8',
    );

    expect(sql).toContain("SET LOCAL TIME ZONE 'UTC'");
    expect(sql).toContain("data_type = 'timestamp without time zone'");
    expect(sql).toContain('AT TIME ZONE %L');
    expect(sql).toContain("'UTC'");
    expect(sql).toContain('NEW.updated_at = clock_timestamp()');
    expect(sql).toContain('BEFORE INSERT OR UPDATE');
  });
});
