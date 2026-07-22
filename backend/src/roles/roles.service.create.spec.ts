import { BadRequestException } from '@nestjs/common';
import { RolesService } from './roles.service';

function makeService() {
  const roleTable = new Map<number, any>();
  let nextId = 1;

  const roleRepoInTx = {
    create: (x: any) => x,
    save: jest.fn(async (x: any) => {
      const id = x.id ?? nextId++;
      const saved = { ...x, id, uuid: `role-${id}` };
      roleTable.set(id, saved);
      return saved;
    }),
  };
  const permissionRepoInTx = {
    create: (x: any) => x,
    insert: jest.fn().mockResolvedValue(undefined),
  };

  const tenantRoleRepo = {
    findOne: jest.fn().mockResolvedValue(undefined), // sem role duplicada
    findOneOrFail: jest.fn(async ({ where }: any) => roleTable.get(where.id)),
    manager: {
      transaction: async (cb: any) => cb({
        getRepository: (entity: any) => (entity.name === 'TenantRole' ? roleRepoInTx : permissionRepoInTx),
      }),
    },
  };
  const tenantRolePermissionRepo = { find: jest.fn().mockResolvedValue([]) };
  const permissionRepo = {
    find: jest.fn(async ({ where }: any) => {
      const valid = new Set(['clientes.ver', 'clientes.criar']);
      return where.slug.value.filter((slug: string) => valid.has(slug)).map((slug: string) => ({ slug }));
    }),
  };

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new RolesService(tenantRoleRepo as any, tenantRolePermissionRepo as any, permissionRepo as any, audit as any);
  return { service, roleRepoInTx, permissionRepoInTx, audit };
}

describe('RolesService.createRole — criação atômica', () => {
  it('cria a role e concede as permissões na mesma transação', async () => {
    const { service, roleRepoInTx, permissionRepoInTx } = makeService();

    const result = await service.createRole('t-1', {
      name: 'Vendas', description: 'Time comercial', permissions: ['clientes.ver', 'clientes.criar'],
    } as any);

    expect(roleRepoInTx.save).toHaveBeenCalledTimes(1);
    expect(permissionRepoInTx.insert).toHaveBeenCalledTimes(1);
    const inserted = permissionRepoInTx.insert.mock.calls[0][0].map((row: any) => row.permissionSlug);
    expect(new Set(inserted)).toEqual(new Set(['clientes.ver', 'clientes.criar']));
    expect(result).toMatchObject({ name: 'vendas', description: 'Time comercial' });
  });

  it('cria a role sem permissões quando nenhuma é informada', async () => {
    const { service, permissionRepoInTx } = makeService();

    await service.createRole('t-1', { name: 'Estagiário' } as any);

    expect(permissionRepoInTx.insert).not.toHaveBeenCalled();
  });

  it('rejeita slug de permissão inválido sem criar a role', async () => {
    const { service, roleRepoInTx } = makeService();

    await expect(
      service.createRole('t-1', { name: 'Vendas', permissions: ['clientes.ver', 'inexistente.slug'] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(roleRepoInTx.save).not.toHaveBeenCalled();
  });

  it('registra auditoria de CREATE com a contagem de permissões quando o actor é informado', async () => {
    const { service, audit } = makeService();
    const actor = { sub: 'user-1', roles: ['manager'] } as any;

    await service.createRole('t-1', { name: 'Vendas', permissions: ['clientes.ver'] } as any, actor);

    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CREATE', resourceType: 'tenant_role', metadata: { permissionCount: 1 },
    }));
  });

  it('não registra auditoria quando nenhum actor é informado', async () => {
    const { service, audit } = makeService();

    await service.createRole('t-1', { name: 'Vendas' } as any);

    expect(audit.record).not.toHaveBeenCalled();
  });
});
