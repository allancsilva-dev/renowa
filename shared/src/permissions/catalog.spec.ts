import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_SLUGS,
  PermissionSlug,
  SYSTEM_ROLE_NAMES,
} from './catalog';

describe('PERMISSION_CATALOG', () => {
  it('has exactly 32 entries, one per PermissionSlug value', () => {
    const enumSlugs = Object.values(PermissionSlug);
    expect(enumSlugs).toHaveLength(32);
    expect(PERMISSION_CATALOG).toHaveLength(32);
    expect(new Set(PERMISSION_SLUGS)).toEqual(new Set(enumSlugs));
  });

  it('has no duplicate slugs', () => {
    const slugs = PERMISSION_CATALOG.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('every entry has a non-empty description and matching module prefix', () => {
    for (const entry of PERMISSION_CATALOG) {
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.slug.startsWith(`${entry.module}.`)).toBe(true);
    }
  });
});

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('only references slugs that exist in the catalog', () => {
    const validSlugs = new Set(PERMISSION_SLUGS);
    for (const slugs of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const slug of slugs) {
        expect(validSlugs.has(slug)).toBe(true);
      }
    }
  });

  it('grants admin and gestao every permission in the catalog', () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.admin)).toEqual(new Set(PERMISSION_SLUGS));
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.gestao)).toEqual(new Set(PERMISSION_SLUGS));
  });

  it('grants financeiro visibility/liberation of pedidos plus faturamento', () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.financeiro)).toEqual(new Set([
      PermissionSlug.FinanceiroVer,
      PermissionSlug.FinanceiroEditar,
      PermissionSlug.PedidosVer,
      PermissionSlug.PedidosLiberar,
      PermissionSlug.FaturamentoVer,
      PermissionSlug.FaturamentoEditar,
    ]));
  });

  it('does not grant vendedor any pedidos.liberar or faturamento permission', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.vendedor).not.toContain(PermissionSlug.PedidosLiberar);
    expect(DEFAULT_ROLE_PERMISSIONS.vendedor).not.toContain(PermissionSlug.FaturamentoVer);
    expect(DEFAULT_ROLE_PERMISSIONS.vendedor).not.toContain(PermissionSlug.FaturamentoEditar);
  });

  // SAC nasce só para admin/gestao (migration 0035). Conceder a vendedor ou
  // financeiro é decisão de negócio a ser feita pela tela de Perfis, não por
  // provisionamento automático.
  it('does not grant vendedor or financeiro any sac permission by default', () => {
    const sacSlugs = [
      PermissionSlug.SacVer, PermissionSlug.SacCriar,
      PermissionSlug.SacEditar, PermissionSlug.SacDeletar,
    ];
    for (const slug of sacSlugs) {
      expect(DEFAULT_ROLE_PERMISSIONS.vendedor).not.toContain(slug);
      expect(DEFAULT_ROLE_PERMISSIONS.financeiro).not.toContain(slug);
    }
  });
});

describe('SYSTEM_ROLE_NAMES', () => {
  it('contains admin and only names with a default permission template', () => {
    expect(SYSTEM_ROLE_NAMES).toContain('admin');
    for (const name of SYSTEM_ROLE_NAMES) {
      expect(DEFAULT_ROLE_PERMISSIONS[name]).toBeDefined();
    }
  });
});
