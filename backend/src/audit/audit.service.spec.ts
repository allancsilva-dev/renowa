import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('records only field names and context, never PII values', async () => {
    const insert = jest.fn().mockResolvedValue(undefined);
    const service = new AuditService({ insert } as never);

    await service.record({
      tenantId: '11111111-1111-4111-8111-111111111111',
      actor: { sub: '22222222-2222-4222-8222-222222222222', roles: ['ADMIN'] },
      action: 'UPDATE', resourceType: 'cliente',
      resourceUuid: '33333333-3333-4333-8333-333333333333',
      fields: ['email', 'cnpj', 'email'], purpose: 'Atualização operacional',
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      fields: ['cnpj', 'email'], metadata: {}, purpose: 'Atualização operacional',
    }));
    const serialized = JSON.stringify(insert.mock.calls[0][0]);
    expect(serialized).not.toContain('@');
  });

  it('always scopes listing by tenant', async () => {
    const qb = { where: jest.fn(), orderBy: jest.fn(), skip: jest.fn(), take: jest.fn(), getManyAndCount: jest.fn() };
    Object.values(qb).forEach((fn) => typeof fn === 'function' && fn.mockReturnValue?.(qb));
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    const service = new AuditService({ createQueryBuilder: jest.fn().mockReturnValue(qb) } as never);
    await service.list('tenant-a', { page: 1, limit: 25 });
    expect(qb.where).toHaveBeenCalledWith('event.tenant_id = :tenantId', { tenantId: 'tenant-a' });
  });
});
