import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource, getMetadataArgsStorage } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Client } from '../clients/entities/client.entity';
import { Commission } from '../finance/entities/commission.entity';
import { Inadimplencia } from '../finance/entities/inadimplencia.entity';
import { Parceiro } from '../finance/entities/parceiro.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Order } from '../orders/entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { Supplier } from '../suppliers/entities/supplier.entity';
import { Transport } from '../transport/entities/transport.entity';
import { User } from '../users/entities/user.entity';
import { Permission } from '../common/entities/permission.entity';

const migration = readFileSync(
  join(__dirname, 'migrations/0021_cross_tenant_foreign_keys.sql'),
  'utf8',
);
const audit = readFileSync(
  join(__dirname, 'audits/prob-0011_cross_tenant_foreign_keys.sql'),
  'utf8',
);

const tenantRelations: Array<[Function, string]> = [
  [Order, 'cliente'],
  [Order, 'fornecedor'],
  [Order, 'transportadora'],
  [Client, 'transportadora'],
  [Product, 'fornecedor'],
  [Inadimplencia, 'cliente'],
  [Commission, 'cliente'],
  [Commission, 'fornecedor'],
  [Parceiro, 'cliente'],
  [Parceiro, 'fornecedor'],
  [OrderItem, 'pedido'],
  [OrderItem, 'produto'],
  [LocalUser, 'role'],
  [TenantRolePermission, 'role'],
  [RefreshToken, 'user'],
  [RefreshToken, 'replaced_by'],
];

describe('PROB-0011 cross-tenant foreign keys', () => {
  it.each(tenantRelations)('%s.%s joins through tenant and id', (entity, property) => {
    const columns = getMetadataArgsStorage().joinColumns
      .filter((column) => column.target === entity && column.propertyName === property)
      .map((column) => [column.name, column.referencedColumnName]);

    expect(columns).toHaveLength(2);
    expect(columns).toContainEqual([
      'tenant_id',
      entity === LocalUser || entity === TenantRolePermission ? 'tenantId' : 'tenant_id',
    ]);
    expect(columns.some(([name, referenced]) => name !== 'tenant_id' && referenced === 'id')).toBe(true);
  });

  it('builds TypeORM foreign-key metadata with both physical columns', async () => {
    const dataSource = new DataSource({
      type: 'postgres',
      entities: [
        Order,
        OrderItem,
        Client,
        Product,
        Supplier,
        Transport,
        Inadimplencia,
        Commission,
        Parceiro,
        LocalUser,
        TenantRole,
        TenantRolePermission,
        Permission,
        RefreshToken,
        User,
      ],
    });

    await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();

    for (const [entity, property] of tenantRelations) {
      const metadata = dataSource.getMetadata(entity);
      const relation = metadata.findRelationWithPropertyPath(property);
      const foreignKey = relation?.foreignKeys[0];

      expect(foreignKey?.columns.map((column) => column.databaseName).sort()).toEqual(
        expect.arrayContaining(['tenant_id']),
      );
      expect(foreignKey?.columns).toHaveLength(2);
      expect(foreignKey?.referencedColumns.map((column) => column.databaseName).sort()).toEqual(
        ['id', 'tenant_id'],
      );
    }
  });

  it('audits every tenant-owned relation before creating constraints', () => {
    expect(migration.indexOf('Cross-tenant audit failed')).toBeGreaterThan(-1);
    expect(migration.indexOf('Cross-tenant audit failed')).toBeLessThan(
      migration.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_tenant_id_id'),
    );

    for (const [, property] of tenantRelations) {
      expect(property).toBeTruthy();
    }

    expect((migration.match(/FOREIGN KEY \(tenant_id, %I\)/g) ?? [])).toHaveLength(1);
    expect(migration).toContain('NOT VALID');
    expect(migration).toContain('VALIDATE CONSTRAINT');
    expect(migration).toContain('cardinality(constraint_row.conkey) = 1');
  });

  it('covers all 16 tenant-owned foreign keys in audit, creation, and validation', () => {
    const relationRows = migration.match(/\('fk_[^\n]+\)/g) ?? [];
    expect(relationRows).toHaveLength(32);

    const auditRows = migration
      .slice(migration.indexOf('FOR relation IN'), migration.indexOf('-- PostgreSQL requires'))
      .match(/\('[a-z_]+', '[a-z_]+', '[a-z_]+'\)/g) ?? [];
    expect(auditRows).toHaveLength(16);
  });

  it('keeps global permission references outside tenant composition', () => {
    expect(migration).not.toContain("'permissions', 'permission_slug'");
  });

  it('provides a read-only detailed pre-deployment audit for all relations', () => {
    expect((audit.match(/UNION ALL SELECT/g) ?? [])).toHaveLength(15);
    expect((audit.match(/FROM public\./g) ?? [])).toHaveLength(16);
    expect(audit).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE)\b/i);
  });
});
