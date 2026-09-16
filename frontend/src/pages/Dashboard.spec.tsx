// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  navigate: vi.fn(),
  permissions: new Set<string>(),
}));

vi.mock('@/lib/apiClient', () => ({ default: { get: mocks.get } }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => mocks.permissions.has(permission) }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

// Recharts mede o contêiner para desenhar; no jsdom a largura é 0 e o gráfico
// nunca renderiza. O layout sob teste é o do card, não o do gráfico.
vi.mock('recharts', async (importOriginal) => ({
  ...await importOriginal<typeof import('recharts')>(),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function dashboardData(curvaAbcSize: number, inativosTotal = 0) {
  return {
    totalVendas: '0', totalCustoFixo: '0', totalCustoRotativo: '0',
    totalComissoes: '0', totalInadimplencia: '0',
    pedidosAbertos: 0, produtosAtivos: 0,
    carteira: { total: inativosTotal, ativos: 0, inativos: inativosTotal, prospect: 0 },
    clientesInativos: Array.from({ length: Math.min(inativosTotal, 20) }, (_, i) => ({
      clienteUuid: `cliente-${i}`,
      cliente: `Cliente inativo ${i}`,
      ultimoPedidoEm: '2026-01-01',
      diasSemPedido: 100 - i,
    })),
    vendasMensais: [],
    curvaAbc: Array.from({ length: curvaAbcSize }, (_, i) => ({
      cliente: `CLIENTE COM RAZAO SOCIAL MUITO LONGA NUMERO ${i} LTDA`,
      valor: '100',
      badge: 'Regular' as const,
    })),
  };
}

// O ambiente jsdom do Vitest não expõe `localStorage` em `globalThis`, e o
// Dashboard lê a preferência de ocultar valores já no primeiro render.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
});

beforeEach(() => {
  cleanup();
  store.clear();
  mocks.permissions.clear();
  mocks.permissions.add('financeiro.ver');
  mocks.get.mockReset();
});

describe('Dashboard — layout da faixa Carteira / Inativos / Curva ABC', () => {
  // Um tenant grande enche a Curva ABC; sem teto de altura no card, o grid
  // esticava os três irmãos até a altura dela e os outros dois ficavam com uma
  // faixa branca morta. Local não reproduzia porque o banco de dev é pequeno.
  it('mantém a Curva ABC com rolagem própria mesmo com a lista cheia', async () => {
    mocks.get.mockResolvedValue({ data: { data: dashboardData(10) } });

    render(<Dashboard />);

    const titulo = await screen.findByText('Curva ABC de Clientes');
    const card = titulo.closest('div')?.parentElement;
    const corpo = card?.querySelector('table')?.parentElement;

    expect(corpo?.className).toContain('max-h-64');
    expect(corpo?.className).toContain('overflow-y-auto');
  });

  it('não deixa o grid esticar os cards até a altura do mais alto', async () => {
    mocks.get.mockResolvedValue({ data: { data: dashboardData(10) } });

    render(<Dashboard />);

    const titulo = await screen.findByText('Carteira de Clientes');
    const faixa = titulo.closest('div')?.parentElement?.parentElement;

    await waitFor(() => expect(faixa?.className).toContain('items-start'));
  });

  it('avisa quando a lista de clientes inativos representa só parte do total', async () => {
    mocks.get.mockResolvedValue({ data: { data: dashboardData(0, 25) } });

    render(<Dashboard />);

    expect(await screen.findByText('20 mais inativos de 25')).toBeInTheDocument();
  });
});
