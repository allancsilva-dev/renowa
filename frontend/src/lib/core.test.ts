import { describe, expect, it } from 'vitest';
import { isAdmin, normalizeRoles } from './authorization';
import { normalizeListResponse } from './pagination';

describe('contratos críticos do frontend', () => {
  it('normaliza roles sem duplicação e reconhece admin', () => {
    const roles = normalizeRoles([' ADMIN ', 'admin', 'viewer']);
    expect(roles).toEqual(['admin', 'viewer']);
    expect(isAdmin(roles)).toBe(true);
  });

  it('preserva metadados de resposta paginada', () => {
    const result = normalizeListResponse({ data: [{ id: 1 }], meta: { total: 21, page: 2, limit: 10, totalPages: 3 } }, 1, 20);
    expect(result.serverPaginated).toBe(true);
    expect(result.meta).toEqual({ total: 21, page: 2, limit: 10, totalPages: 3 });
  });
});
