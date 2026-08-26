import { describe, expect, it } from 'vitest';
import { formatRole, hasAnyRole, hasPermission, hasRole, isAdmin, normalizeRoles } from './authorization';

describe('normalizeRoles', () => {
  it('normaliza caixa, apara espaços e remove duplicatas e vazios', () => {
    expect(normalizeRoles([' Admin ', 'admin', '', 'Vendedor'])).toEqual(['admin', 'vendedor']);
  });

  it('devolve lista vazia quando não há papéis', () => {
    expect(normalizeRoles(undefined)).toEqual([]);
  });
});

describe('hasRole / hasAnyRole / isAdmin', () => {
  it('compara papéis ignorando caixa e espaços', () => {
    expect(hasRole([' Admin '], 'admin')).toBe(true);
    expect(hasRole(['vendedor'], 'admin')).toBe(false);
    expect(hasRole(['vendedor'], '')).toBe(false);
  });

  it('hasAnyRole aceita qualquer um da lista', () => {
    expect(hasAnyRole(['financeiro'], ['admin', 'financeiro'])).toBe(true);
    expect(hasAnyRole(['vendedor'], ['admin', 'financeiro'])).toBe(false);
  });

  it('isAdmin segue existindo para uso não relacionado a permissão', () => {
    expect(isAdmin(['admin'])).toBe(true);
    expect(isAdmin(['gestao'])).toBe(false);
  });
});

describe('hasPermission', () => {
  it('autoriza pelo slug efetivo', () => {
    expect(hasPermission(['vendedor'], ['clientes.ver'], 'clientes.ver')).toBe(true);
    expect(hasPermission(['vendedor'], ['clientes.ver'], 'clientes.editar')).toBe(false);
  });

  // Regressão: havia um `isAdmin(roles) ||` aqui. O backend removeu o bypass
  // por nome no overhaul de RBAC, então a UI liberava botão que a API recusava
  // com 403 — e um perfil sob medida chamado `admin`, sem permissão nenhuma,
  // abria o produto inteiro na tela.
  it('NÃO passa pelo nome do perfil admin', () => {
    expect(hasPermission(['admin'], [], 'clientes.ver')).toBe(false);
    expect(hasPermission(['Admin'], ['pedidos.ver'], 'usuarios.gerenciar')).toBe(false);
  });

  it('o admin de sistema continua autorizado pelos vínculos reais', () => {
    expect(hasPermission(['admin'], ['usuarios.gerenciar'], 'usuarios.gerenciar')).toBe(true);
  });
});

describe('formatRole', () => {
  it('rotula superadmin à parte — é papel de plataforma, não tenant_role', () => {
    expect(formatRole('SUPERADMIN')).toBe('Super administrador');
  });

  it('devolve string vazia para papel vazio', () => {
    expect(formatRole('   ')).toBe('');
  });
});
