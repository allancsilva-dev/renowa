// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Faturamento from './Faturamento';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), registrar: vi.fn() }));

vi.mock('@/services/faturamento.service', () => ({
  fetchFaturamentoPedidos: (...args: unknown[]) => mocks.fetch(...args),
  registrarNota: (...args: unknown[]) => mocks.registrar(...args),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

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

describe('Faturamento — registro de nota', () => {
  const comPedido = {
    data: [{
      uuid: 'pedido-1', numero_pedido: 10, status: 'liberado', cliente: 'Cliente', fornecedor: 'Fornecedor',
      valor: '100.00', total_faturado: '0.00', divergencia: '100.00', origem: 'interno',
      sistema_origem: null, numero_pedido_externo: null,
    }],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };

  it('abre com 5% e envia percentual editado ao registrar', async () => {
    mocks.fetch.mockResolvedValue(comPedido);
    mocks.registrar.mockResolvedValue({});
    render(<Faturamento />);

    fireEvent.click(await screen.findByRole('button', { name: 'Registrar nota' }));
    const percentual = screen.getByLabelText(/% Comissão/);
    expect(percentual).toHaveValue(5);

    fireEvent.change(screen.getByLabelText(/Número da nota/), { target: { value: 'NF-1' } });
    const valor = screen.getByLabelText(/Valor/);
    fireEvent.focus(valor);
    fireEvent.change(valor, { target: { value: '100,00' } });
    fireEvent.blur(valor);
    fireEvent.change(percentual, { target: { value: '7.5' } });
    fireEvent.submit(percentual.closest('form')!);

    await waitFor(() => expect(mocks.registrar).toHaveBeenCalledWith('pedido-1', expect.objectContaining({
      numero_nota: 'NF-1', valor: 100, perc_comissao: 7.5,
    })));
  });
});
