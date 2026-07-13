import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  it('filters effective permissions by tenant and role', async () => {
    const permissionRepo = { find: jest.fn() } as any;
    const linkRepo = {
      find: jest.fn(async () => [
        { permissionSlug: 'pedidos.ver' },
        { permissionSlug: 'pedidos.ver' },
      ]),
    } as any;
    const service = new PermissionsService(permissionRepo, linkRepo);

    await expect(service.listEffectiveForRole('tenant-a', 9))
      .resolves.toEqual(['pedidos.ver']);
    expect(linkRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-a', roleId: 9 },
    }));
  });
});
