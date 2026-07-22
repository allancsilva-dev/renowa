import { PERMISSION_CATALOG, PERMISSION_SLUGS, PermissionSlug } from './catalog';

describe('PERMISSION_CATALOG', () => {
  it('has exactly 25 entries, one per PermissionSlug value', () => {
    const enumSlugs = Object.values(PermissionSlug);
    expect(enumSlugs).toHaveLength(25);
    expect(PERMISSION_CATALOG).toHaveLength(25);
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
