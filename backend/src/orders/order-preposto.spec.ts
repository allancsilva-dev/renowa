import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { RequestUser } from '../common/types/jwt-payload.type';

const tenantId = 'tenant-a';
const ids: Record<string, number> = { clientes: 1, usuarios: 2, fornecedores: 3, transportadoras: 4, prepostos: 7 };
const base = {
  cliente_uuid: '11111111-1111-4111-8111-111111111111',
  fornecedor_uuid: '33333333-3333-4333-8333-333333333333',
};
const prepostoUuid = '77777777-7777-4777-8777-777777777777';
const vendedorUuid = '22222222-2222-4222-8222-222222222222';

function user(roles: string[]): RequestUser {
  return { sub: vendedorUuid, tenantId, roles } as RequestUser;
}

function subject() {
  const manager = {
    query: jest.fn(async (sql: string) => {
      const table = /FROM (\w+)/.exec(sql)![1];
      return [{ id: ids[table] }];
    }),
  };
  const service = new OrdersService({} as any, {} as any, {} as any, {} as any);
  const resolve = (dto: object, u: RequestUser, current: number | null = null) =>
    (service as any).resolveHeader(manager, dto, u, current);
  return { manager, resolve };
}

describe('Pedido — preposto no cabeçalho', () => {
  it('ADMIN/GESTAO gravam o preposto resolvido no tenant, sem vendedor', async () => {
    const { manager, resolve } = subject();
    const refs = await resolve({ ...base, preposto_uuid: prepostoUuid }, user(['GESTAO']));
    expect(refs).toEqual(expect.objectContaining({ preposto_id: 7, vendedor_id: null }));
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM prepostos WHERE uuid = $1 AND tenant_id = $2 AND deleted_at IS NULL'),
      [prepostoUuid, tenantId],
    );
  });

  it('recusa vendedor e preposto juntos', async () => {
    const { resolve } = subject();
    await expect(resolve({ ...base, vendedor_uuid: vendedorUuid, preposto_uuid: prepostoUuid }, user(['ADMIN'])))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('VENDEDOR enviando preposto recebe 403 — nem null é aceito', async () => {
    const { resolve } = subject();
    await expect(resolve({ ...base, preposto_uuid: prepostoUuid }, user(['VENDEDOR']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(resolve({ ...base, preposto_uuid: null }, user(['VENDEDOR']))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('VENDEDOR editando preserva o preposto já gravado', async () => {
    const { manager, resolve } = subject();
    const refs = await resolve(base, user(['VENDEDOR']), 7);
    expect(refs.preposto_id).toBe(7);
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('FROM prepostos'), expect.anything());
  });

  it('PUT de ADMIN sem preposto remove o vínculo (substituição completa do cabeçalho)', async () => {
    const { resolve } = subject();
    const refs = await resolve({ ...base, vendedor_uuid: vendedorUuid }, user(['ADMIN']), 7);
    expect(refs).toEqual(expect.objectContaining({ preposto_id: null, vendedor_id: 2 }));
  });

  it('preposto de outro tenant ou excluído vira 400', async () => {
    const { manager, resolve } = subject();
    manager.query.mockImplementation(async (sql: string) => (sql.includes('FROM prepostos') ? [] : [{ id: 1 }]));
    await expect(resolve({ ...base, preposto_uuid: prepostoUuid }, user(['ADMIN']))).rejects.toBeInstanceOf(BadRequestException);
  });
});
