import { describe, expect, it } from 'vitest';
import { isAdmin, normalizeRoles } from './authorization';
import { withGeneratedUuid } from './entityPayload';
import { normalizeListResponse } from './pagination';

describe('contratos críticos do frontend', () => {
  it('inclui UUID v4 em novos registros', () => {
    const payload = withGeneratedUuid({ nome: 'Registro' });
    expect(payload.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(payload.nome).toBe('Registro');
  });

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
