import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_SLUGS,
  PermissionSlug,
  ROLE_TEMPLATES,
  ROLE_TEMPLATE_NAMES,
  SYSTEM_ROLE_NAMES,
  formatRoleName,
} from './catalog';

describe('PERMISSION_CATALOG', () => {
  it('has exactly 32 entries, one per PermissionSlug value', () => {
    const enumSlugs = Object.values(PermissionSlug);
    expect(enumSlugs).toHaveLength(36);
    expect(PERMISSION_CATALOG).toHaveLength(36);
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

  it('grants financeiro visibility/liberation of pedidos plus faturamento and prepostos read', () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.financeiro)).toEqual(new Set([
      PermissionSlug.FinanceiroVer,
      PermissionSlug.FinanceiroEditar,
      PermissionSlug.PedidosVer,
      PermissionSlug.PedidosLiberar,
      PermissionSlug.FaturamentoVer,
      PermissionSlug.FaturamentoEditar,
      PermissionSlug.PrepostosVer,
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

  // Preposto tem documento/contato e comissão de terceiro: vendedor não vê;
  // financeiro só lê (paga com financeiro.editar). Espelha a 0050.
  it('grants prepostos only read to financeiro and nothing to vendedor', () => {
    const slugs = [
      PermissionSlug.PrepostosVer, PermissionSlug.PrepostosCriar,
      PermissionSlug.PrepostosEditar, PermissionSlug.PrepostosDeletar,
    ];
    for (const slug of slugs) expect(DEFAULT_ROLE_PERMISSIONS.vendedor).not.toContain(slug);
    expect(DEFAULT_ROLE_PERMISSIONS.financeiro).toContain(PermissionSlug.PrepostosVer);
    expect(DEFAULT_ROLE_PERMISSIONS.financeiro).not.toContain(PermissionSlug.PrepostosEditar);
  });
});

/**
 * O defeito que estes casos travam: a tela de Usuários oferecia `manager` e
 * `viewer`, nomes que `DEFAULT_ROLE_PERMISSIONS` não conhece. O backend criava
 * a tenant_role assim mesmo, sem permissão nenhuma, e o usuário logava para
 * tomar 403 em todo endpoint. Enquanto a lista oferecida e a lista provisionável
 * forem a mesma, isso não volta.
 */
describe('ROLE_TEMPLATES', () => {
  it('cobre exatamente as chaves de DEFAULT_ROLE_PERMISSIONS', () => {
    expect(new Set(ROLE_TEMPLATE_NAMES)).toEqual(new Set(Object.keys(DEFAULT_ROLE_PERMISSIONS)));
  });

  it('todo perfil oferecido nasce com pelo menos uma permissão', () => {
    for (const name of ROLE_TEMPLATE_NAMES) {
      expect(DEFAULT_ROLE_PERMISSIONS[name].length).toBeGreaterThan(0);
    }
  });

  it('nomes são lowercase, únicos, e todo rótulo é preenchido', () => {
    expect(new Set(ROLE_TEMPLATE_NAMES).size).toBe(ROLE_TEMPLATE_NAMES.length);
    for (const role of ROLE_TEMPLATES) {
      expect(role.name).toBe(role.name.toLowerCase());
      expect(role.label.length).toBeGreaterThan(0);
    }
  });

  it('formatRoleName usa o rótulo do template e title-case no perfil custom', () => {
    expect(formatRoleName('gestao')).toBe('Gestão');
    expect(formatRoleName('  ADMIN ')).toBe('Administrador');
    expect(formatRoleName('equipe_vendas')).toBe('Equipe Vendas');
    expect(formatRoleName('')).toBe('');
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
