// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Financeiro from './Financeiro';

const mocks = vi.hoisted(() => ({ get: vi.fn(), navigate: vi.fn() }));

vi.mock('@/lib/apiClient', () => ({ default: { get: (...args: unknown[]) => mocks.get(...args) } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Financeiro — Faturados', () => {
  it('mostra uma nota parcial diretamente na aba e abre o detalhe do pedido', async () => {
    mocks.get.mockImplementation(async (url: string) => {
      if (url.startsWith('/financeiro/fluxo-caixa')) {
        return { data: { data: { receitas: '0.00', custos: '0.00', saldo: '0.00', lancamentos: [] } } };
      }
      if (url === '/financeiro/faturados') {
        return { data: {
          data: [{
            uuid: 'nota-1', numero_nota: '123', serie: '1', valor: '40.00', data_faturamento: '2026-09-15',
            pedido_uuid: 'pedido-1', numero_pedido: 10, cliente: 'Cliente Um', fornecedor_uuid: 'forn-1', fornecedor: 'Fornecedor Um',
          }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        } };
      }
      if (url === '/financeiro/faturados/fornecedores') return { data: { data: [{ uuid: 'forn-1', razao_social: 'Fornecedor Um' }] } };
      throw new Error(`URL inesperada: ${url}`);
    });

    render(<Financeiro />);
    fireEvent.click(screen.getByRole('button', { name: 'Faturados' }));

    expect(await screen.findByText('123 / 1')).toBeInTheDocument();
    expect(screen.getByText('R$ 40,00')).toBeInTheDocument();
    expect(screen.getAllByText('Fornecedor Um').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhe' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/faturamento/pedido-1');
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/financeiro/faturados', expect.objectContaining({ params: expect.objectContaining({ mes: expect.any(Number), ano: expect.any(Number) }) })));
  });
});
