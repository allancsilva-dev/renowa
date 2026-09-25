// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Faturamento from './Faturamento';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/services/faturamento.service', () => ({
  fetchFaturamentoPedidos: (...args: unknown[]) => mocks.fetch(...args),
  registrarNota: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const vazio = { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } };

describe('Faturamento — busca', () => {
  it('busca por nº pedido, CNPJ ou razão social no servidor, sem espaços e voltando à página 1', async () => {
    mocks.fetch.mockResolvedValue(vazio);
    render(<Faturamento />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith({ page: 1, limit: 20, search: undefined }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pedidos a faturar' }), { target: { value: ' 12.345.678/0001-90 ' } });

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith({ page: 1, limit: 20, search: '12.345.678/0001-90' }));
    expect(await screen.findByText('Nenhum pedido encontrado para a busca')).toBeInTheDocument();
  });

  it('sem busca mantém o estado vazio original', async () => {
    mocks.fetch.mockResolvedValue(vazio);
    render(<Faturamento />);
    expect(await screen.findByText('Nenhum pedido para faturar')).toBeInTheDocument();
  });
});
