import { PermissionsService } from './permissions.service';
import { TenantRole } from '../rbac/entities/tenant-role.entity';

/** Query builder encadeável que registra o que foi montado. */
function fakeQueryBuilder(rows: Array<{ slug: string }>) {
  const calls = { joins: [] as any[], wheres: [] as string[], params: {} as Record<string, unknown> };
  const qb: any = {
    select: () => qb,
    innerJoin: (entity: any, alias: string, condition: string) => {
      calls.joins.push({ entity, alias, condition });
      return qb;
    },
    where: (clause: string, params?: Record<string, unknown>) => {
      calls.wheres.push(clause);
      Object.assign(calls.params, params ?? {});
      return qb;
    },
    andWhere: (clause: string, params?: Record<string, unknown>) => {
      calls.wheres.push(clause);
      Object.assign(calls.params, params ?? {});
      return qb;
    },
    orderBy: () => qb,
    getRawMany: async () => rows,
  };
  return { qb, calls };
}

describe('PermissionsService', () => {
  it('filters effective permissions by tenant and role, and dedupes', async () => {
    const { qb, calls } = fakeQueryBuilder([
      { slug: 'pedidos.ver' },
      { slug: 'pedidos.ver' },
    ]);
    const permissionRepo = { find: jest.fn() } as any;
    const linkRepo = { createQueryBuilder: jest.fn(() => qb) } as any;
    const service = new PermissionsService(permissionRepo, linkRepo);

    await expect(service.listEffectiveForRole('tenant-a', 9))
      .resolves.toEqual(['pedidos.ver']);
    expect(calls.params).toMatchObject({ tenantId: 'tenant-a', roleId: 9 });
  });

  // A regressão que faltava: excluir perfil é soft-delete, então as linhas de
  // `tenant_role_permissions` sobrevivem. Sem exigir role viva na leitura,
  // usuário de perfil excluído seguia autorizado indefinidamente.
  it('exige perfil vivo — join com tenant_roles filtrando active e deleted_at', async () => {
    const { qb, calls } = fakeQueryBuilder([]);
    const linkRepo = { createQueryBuilder: jest.fn(() => qb) } as any;
    const service = new PermissionsService({ find: jest.fn() } as any, linkRepo);

    await expect(service.listEffectiveForRole('tenant-a', 9)).resolves.toEqual([]);

    expect(calls.joins).toHaveLength(1);
    expect(calls.joins[0].entity).toBe(TenantRole);
    expect(calls.joins[0].condition).toMatch(/role\.id = trp\.role_id/);
    expect(calls.joins[0].condition).toMatch(/role\.tenant_id = trp\.tenant_id/);

    const clauses = calls.wheres.join(' | ');
    expect(clauses).toMatch(/role\.active = true/);
    expect(clauses).toMatch(/role\.deleted_at IS NULL/);
  });
});
