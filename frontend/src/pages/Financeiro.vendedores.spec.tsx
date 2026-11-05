// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Financeiro from './Financeiro';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), vendas: vi.fn(), prepostos: vi.fn(), percentual: vi.fn(), pagamento: vi.fn(),
  permissions: new Set<string>(),
}));

vi.mock('@/lib/apiClient', () => ({ default: { get: (...args: unknown[]) => mocks.get(...args), patch: vi.fn() } }));
vi.mock('@/services/prepostos.service', () => ({
  fetchPrepostoVendas: (...args: unknown[]) => mocks.vendas(...args),
  fetchPrepostos: (...args: unknown[]) => mocks.prepostos(...args),
  alterarPercentualVenda: (...args: unknown[]) => mocks.percentual(...args),
  registrarPagamentoVenda: (...args: unknown[]) => mocks.pagamento(...args),
}));
vi.mock('@/pages/prepostos/PrepostosCadastro', () => ({ default: () => <p>cadastro de vendedores</p> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: (slug: string) => mocks.permissions.has(slug) }) }));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

function venda(overrides: Record<string, unknown> = {}) {
  return {
    uuid: 'v1', version: 2, status: 'pendente', situacao: 'liberada', data_liberacao: '2026-10-08',
    numero_nfe: 'NF-9', data_faturamento: '2026-10-01', data_pagamento: null,
    valor_faturado: '1000.00', perc_comissao: '3.00', valor_comissao: '30.00',
    preposto: { uuid: 'p1', nome: 'Paula' },
    pedido: { uuid: 'ped', numero_pedido: 42, cliente: 'Cliente X', fornecedor: 'Fornecedor Y' },
    ...overrides,
  };
}

function resposta(rows: unknown[]) {
  return {
    data: rows,
    meta: {
      total: rows.length, page: 1, limit: 20, totalPages: 1,
      totais: { faturado: '1000.00', comissao_pendente: '30.00', comissao_aguardando: '0.00', comissao_liberada: '30.00', comissao_paga: '0.00' },
    },
  };
}

async function abrirVendedores() {
  render(<Financeiro />);
  fireEvent.click(screen.getByRole('button', { name: 'Vendedores' }));
  await waitFor(() => expect(mocks.vendas).toHaveBeenCalled());
}

async function abrirMenu(nome = 'Paula', nf = 'NF-9') {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da comissão de ${nome} NF ${nf}` }));
}

beforeEach(() => {
  ['financeiro.ver', 'financeiro.editar', 'prepostos.ver', 'prepostos.editar'].forEach((slug) => mocks.permissions.add(slug));
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  mocks.get.mockResolvedValue({ data: { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } } });
  mocks.prepostos.mockResolvedValue({ data: [], meta: { page: 1, totalPages: 1 } });
  mocks.percentual.mockResolvedValue({});
  mocks.pagamento.mockResolvedValue({});
});
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.permissions.clear(); window.history.replaceState(null, '', '/'); });

describe('Financeiro — aba Vendedores', () => {
  it('fica logo depois de Comissão e some sem prepostos.ver', () => {
    const { unmount } = render(<Financeiro />);
    const abas = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(abas.indexOf('Vendedores') - abas.indexOf('Comissão')).toBe(1);
    unmount();

    mocks.permissions.delete('prepostos.ver');
    render(<Financeiro />);
    expect(screen.queryByRole('button', { name: 'Vendedores' })).not.toBeInTheDocument();
  });

  it('?aba=vendedores abre direto na aba (link antigo de /prepostos)', async () => {
    window.history.replaceState(null, '', '/financeiro?aba=vendedores');
    mocks.vendas.mockResolvedValue(resposta([]));
    render(<Financeiro />);
    await waitFor(() => expect(mocks.vendas).toHaveBeenCalled());
  });

  it('lista com período do mês, fornecedor, vendedor, status e totais por situação', async () => {
    mocks.vendas.mockResolvedValue(resposta([venda()]));
    await abrirVendedores();

    expect(await screen.findByText('NF-9')).toBeInTheDocument();
    expect(screen.getByText('Fornecedor Y')).toBeInTheDocument();
    expect(screen.getByText('LIBERADA')).toBeInTheDocument();
    expect(screen.getByText('Empresa recebeu em 08/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Liberada a pagar')).toBeInTheDocument();
    expect(screen.getByLabelText('Data inicial')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrar por vendedor')).toBeInTheDocument();
    expect(mocks.vendas).toHaveBeenCalledWith(expect.objectContaining({ data_inicio: expect.stringMatching(/^\d{4}-\d{2}-01$/) }));

    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'aguardando' } });
    await waitFor(() => expect(mocks.vendas).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'aguardando' })));

    fireEvent.change(screen.getByLabelText('Buscar comissões de vendedores'), { target: { value: 'Paula' } });
    await waitFor(() => expect(mocks.vendas).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Paula' })));
  });

  it('aguardando empresa: pagamento desabilitado, percentual editável', async () => {
    mocks.vendas.mockResolvedValue(resposta([venda({ situacao: 'aguardando', data_liberacao: null })]));
    await abrirVendedores();
    await abrirMenu();

    expect(screen.getByRole('menuitem', { name: 'Registrar pagamento (aguardando empresa)' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar percentual' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Percentual de comissão'), { target: { value: '4.5' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mocks.percentual).toHaveBeenCalledWith('v1', { perc_comissao: 4.5, version: 2 }));
  });

  it('liberada: registra a data de pagamento ao vendedor', async () => {
    mocks.vendas.mockResolvedValue(resposta([venda()]));
    await abrirVendedores();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Registrar pagamento' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Data de pagamento'), { target: { value: '2026-10-10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(mocks.pagamento).toHaveBeenCalledWith('v1', { data_pagamento: '2026-10-10', version: 2 }));
  });

  it('pago: só estorno; sem financeiro.editar não paga', async () => {
    mocks.vendas.mockResolvedValue(resposta([venda({ status: 'pago', situacao: 'pago', data_pagamento: '2026-10-10' })]));
    await abrirVendedores();
    expect(await screen.findByText('Pago em 10/10/2026')).toBeInTheDocument();
    await abrirMenu();
    expect(screen.queryByRole('menuitem', { name: 'Editar percentual' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Estornar pagamento' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Estornar' }));
    await waitFor(() => expect(mocks.pagamento).toHaveBeenCalledWith('v1', { data_pagamento: null, version: 2 }));
  });

  it('alterna para o cadastro de vendedores', async () => {
    mocks.vendas.mockResolvedValue(resposta([]));
    await abrirVendedores();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastro' }));
    expect(screen.getByText('cadastro de vendedores')).toBeInTheDocument();
  });
});
