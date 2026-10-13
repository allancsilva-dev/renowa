// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Faturamento from './Faturamento';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), registrar: vi.fn(), ajustar: vi.fn(), cancelar: vi.fn(), pdf: vi.fn(),
  roles: ['ADMIN'] as string[],
}));

vi.mock('@/services/faturamento.service', () => ({
  fetchFaturamentoPedidos: (...args: unknown[]) => mocks.fetch(...args),
  registrarNota: (...args: unknown[]) => mocks.registrar(...args),
  ajustarValorPedido: (...args: unknown[]) => mocks.ajustar(...args),
}));
vi.mock('@/services/orders.service', () => ({
  updateOrderStatus: (...args: unknown[]) => mocks.cancelar(...args),
}));
vi.mock('@/hooks/useOrderPdf', () => ({
  useOrderPdf: () => ({ generate: mocks.pdf, loadingUuid: null, error: null, warning: null }),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    hasAnyRole: (roles: string[]) => roles.some((role) => mocks.roles.includes(role)),
  }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.roles = ['ADMIN']; });

async function abrirMenu(numero = 10) {
  fireEvent.click(await screen.findByRole('button', { name: `Ações do pedido #${numero}` }));
}

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
      uuid: 'pedido-1', numero_pedido: 10, status: 'liberado', version: 3, cliente: 'Cliente', fornecedor: 'Fornecedor',
      valor: '100.00', valor_original: '100.00', valor_ajustado: null, total_faturado: '0.00', divergencia: '100.00', origem: 'interno',
      sistema_origem: null, numero_pedido_externo: null,
    }],
    meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
  };

  it('abre com 5% e envia percentual editado ao registrar', async () => {
    mocks.fetch.mockResolvedValue(comPedido);
    mocks.registrar.mockResolvedValue({});
    render(<Faturamento />);

    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Registrar nota' }));
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

  it('menu ⋮ reúne todas as ações; Editar valor só para ADMIN', async () => {
    mocks.fetch.mockResolvedValue(comPedido);
    render(<Faturamento />);
    await abrirMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Ver detalhes', 'Registrar nota', 'Ver PDF', 'Editar valor', 'Cancelar pedido',
    ]);
    cleanup();

    mocks.roles = ['GESTAO'];
    render(<Faturamento />);
    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: 'Editar valor' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Ver PDF' })).toBeInTheDocument();
  });

  it('Ver PDF gera o papel do pedido da linha', async () => {
    mocks.fetch.mockResolvedValue(comPedido);
    render(<Faturamento />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver PDF' }));
    expect(mocks.pdf).toHaveBeenCalledWith('pedido-1');
  });

  it('Editar valor envia valor, motivo e versão; recusa valor abaixo do faturado', async () => {
    mocks.fetch.mockResolvedValue({ ...comPedido, data: [{ ...comPedido.data[0], status: 'parcialmente_faturado', total_faturado: '40.00' }] });
    mocks.ajustar.mockResolvedValue({});
    render(<Faturamento />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar valor' }));

    const valor = screen.getByLabelText(/Novo valor/);
    fireEvent.focus(valor);
    fireEvent.change(valor, { target: { value: '30,00' } });
    fireEvent.blur(valor);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Desconto negociado' } });
    fireEvent.submit(valor.closest('form')!);
    expect(await screen.findByText('O valor não pode ficar abaixo do total já faturado.')).toBeInTheDocument();
    expect(mocks.ajustar).not.toHaveBeenCalled();

    fireEvent.focus(valor);
    fireEvent.change(valor, { target: { value: '90,50' } });
    fireEvent.blur(valor);
    fireEvent.submit(valor.closest('form')!);
    await waitFor(() => expect(mocks.ajustar).toHaveBeenCalledWith('pedido-1', { valor: 90.5, motivo: 'Desconto negociado', version: 3 }));
  });

  it('Cancelar pedido pede confirmação e usa a versão da linha', async () => {
    mocks.fetch.mockResolvedValue(comPedido);
    mocks.cancelar.mockResolvedValue({});
    render(<Faturamento />);
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancelar pedido' }));
    expect(mocks.cancelar).not.toHaveBeenCalled();

    // <dialog> sem showModal real no jsdom fica fora da árvore acessível.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido', hidden: true }));
    await waitFor(() => expect(mocks.cancelar).toHaveBeenCalledWith('pedido-1', 'cancelado', 3));
  });

  it('pedido parcialmente faturado não oferece cancelamento', async () => {
    mocks.fetch.mockResolvedValue({ ...comPedido, data: [{ ...comPedido.data[0], status: 'parcialmente_faturado' }] });
    render(<Faturamento />);
    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });
});
