import { hasRoleName, isAdmin } from './roles';
import { isVendorOnly } from '../../orders/order-ownership';

describe('papéis sem caixa', () => {
  it('ADMIN é reconhecido em qualquer caixa', () => {
    expect(isAdmin({ roles: ['admin'] })).toBe(true);
    expect(isAdmin({ roles: ['ADMIN'] })).toBe(true);
    expect(isAdmin({ roles: ['gestao'] })).toBe(false);
    expect(hasRoleName({ roles: [' Gestao '] }, 'GESTAO')).toBe(true);
  });

  it('vendedor em minúsculo continua sob ownership (só os próprios pedidos)', () => {
    expect(isVendorOnly({ roles: ['vendedor'] } as any)).toBe(true);
    expect(isVendorOnly({ roles: ['VENDEDOR', 'vendedor'] } as any)).toBe(true);
    expect(isVendorOnly({ roles: ['vendedor', 'admin'] } as any)).toBe(false);
    expect(isVendorOnly({ roles: [] } as any)).toBe(false);
  });
});
