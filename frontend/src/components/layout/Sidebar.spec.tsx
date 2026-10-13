// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

const mocks = vi.hoisted(() => ({ permissions: new Set<string>() }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@teste.com', roles: ['ADMIN'] },
    logout: vi.fn(),
    hasPermission: (slug: string) => mocks.permissions.has(slug),
  }),
}));

afterEach(() => { cleanup(); mocks.permissions.clear(); });

function navLabels(): string[] {
  const nav = screen.getAllByRole('navigation')[0];
  return within(nav).getAllByRole('link').map((link) => link.textContent?.trim() ?? '');
}

describe('Sidebar', () => {
  it('segue cadastros e depois o ciclo comercial: Pedidos logo acima de Faturamento', () => {
    ['clientes.ver', 'pedidos.ver', 'produtos.ver', 'fornecedores.ver', 'transportadoras.ver',
      'faturamento.ver', 'financeiro.ver', 'prepostos.ver', 'sac.ver'].forEach((slug) => mocks.permissions.add(slug));
    render(<MemoryRouter><Sidebar /></MemoryRouter>);

    const esperado = ['Dashboard', 'Clientes', 'Produtos', 'Fornecedores', 'Transporte', 'Pedidos', 'Faturamento', 'Financeiro', 'Prepostos', 'SAC'];
    const labels = navLabels();
    expect(labels.filter((label) => esperado.includes(label))).toEqual(esperado);
    expect(labels.indexOf('Faturamento') - labels.indexOf('Pedidos')).toBe(1);
  });

  it('esconde módulos sem permissão de leitura', () => {
    mocks.permissions.add('pedidos.ver');
    render(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(navLabels()).toContain('Pedidos');
    expect(navLabels()).not.toContain('Faturamento');
  });
});
