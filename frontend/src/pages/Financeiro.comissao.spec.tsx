// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Financeiro from './Financeiro';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), navigate: vi.fn(), canEdit: true }));

vi.mock('@/lib/apiClient', () => ({
  default: {
    get: (...args: unknown[]) => mocks.get(...args),
    patch: (...args: unknown[]) => mocks.patch(...args),
  },
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (slug: string) => slug === 'financeiro.editar' ? mocks.canEdit : false }),
}));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

function comissao(overrides: Record<string, unknown>) {
  return {
    uuid: 'c1', version: 3, fornecedor_id: 1, fornecedor: { razao_social: 'Fornecedor Um' }, cliente: { razao_social: 'Cliente Um' },
    numero_pedido: '42', numero_nfe: '1001', nota_fiscal_id: 7, data_pedido: '2026-07-01', data_faturamento: '2026-07-10',
    data_pagamento: null, valor_pedido: '1000.00', valor_faturado: '1000.00', perc_comissao: '5.00', valor_comissao: '50.00',
    status: 'faturado', ...overrides,
  };
}

function mockLista(rows: unknown[]) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url.startsWith('/financeiro/comissoes/resumo')) {
      return { data: { data: { total: '0.00', faturado: '0.00', pendente: '0.00', pago: '0.00', bloqueado: '0.00' } } };
    }
    if (url.startsWith('/financeiro/comissoes?')) return { data: { data: rows } };
    return { data: { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } } };
  });
}

function chamadasLista() {
  return mocks.get.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith('/financeiro/comissoes?'));
}

async function abrirComissao() {
  render(<Financeiro />);
  fireEvent.click(screen.getByRole('button', { name: 'Comissão' }));
  await waitFor(() => expect(chamadasLista().length).toBeGreaterThan(0));
}

async function abrirMenu(nf = '1001') {
  fireEvent.click(await screen.findByRole('button', { name: `Ações da comissão NF ${nf}` }));
}

beforeEach(() => {
  mocks.canEdit = true;
  // jsdom não implementa <dialog>; o atributo `open` deixa o conteúdo acessível às queries por role.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  mocks.patch.mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Financeiro — Comissão: colunas e ordenação', () => {
  it('clicar em Data NF alterna a ordem e refaz a busca', async () => {
    mockLista([comissao({})]);
    await abrirComissao();
    expect(chamadasLista().at(-1)).toContain('ordem=desc');
    const th = screen.getAllByRole('columnheader')[1];
    expect(th).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(within(th).getByRole('button', { name: /Ordenar por data NF/ }));

    await waitFor(() => expect(chamadasLista().at(-1)).toContain('ordem=asc'));
    expect(screen.getAllByRole('columnheader')[1]).toHaveAttribute('aria-sort', 'ascending');
  });
});

describe('Financeiro — Comissão: filtro de período', () => {
  it('ano digitado pela metade não dispara busca nem arrasta a outra data', async () => {
    mockLista([comissao({})]);
    await abrirComissao();
    fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-02-01' } });
    await waitFor(() => expect(chamadasLista().at(-1)).toMatch(/data_inicio=2026-01-01.*data_fim=2026-02-01/));
    const antes = chamadasLista().length;

    for (const value of ['0002-02-01', '0020-02-01', '0202-02-01']) {
      fireEvent.change(screen.getByLabelText('Data final'), { target: { value } });
    }

    expect(chamadasLista()).toHaveLength(antes);
    expect(screen.getByLabelText('Data inicial')).toHaveValue('2026-01-01');
    expect(mocks.get).not.toHaveBeenCalledWith(expect.stringMatching(/data_(inicio|fim)=0/));

    fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-03-31' } });
    await waitFor(() => expect(chamadasLista().at(-1)).toMatch(/data_inicio=2026-01-01.*data_fim=2026-03-31/));
  });
});

describe('Financeiro — Comissão: ações no menu ⋮', () => {
  it('registrar pagamento só envia com data completa e depois de confirmar', async () => {
    mockLista([comissao({})]);
    await abrirComissao();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Registrar pagamento' }));

    const input = screen.getByLabelText('Data de pagamento');
    expect(input).toHaveAttribute('min', '2026-07-10');
    const confirmar = screen.getByRole('button', { name: 'Confirmar pagamento' });
    for (const value of ['0002-07-20', '0020-07-20', '0202-07-20']) {
      fireEvent.change(input, { target: { value } });
      expect(confirmar).toBeDisabled();
    }
    fireEvent.submit(input.closest('form')!);
    expect(mocks.patch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '2026-07-20' } });
    expect(confirmar).toBeEnabled();
    fireEvent.click(confirmar);

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch).toHaveBeenCalledWith('/financeiro/comissoes/c1/pagamento', { data_pagamento: '2026-07-20', version: 3 });
  });

  it('recusa data anterior à NF sem chamar a API', async () => {
    mockLista([comissao({})]);
    await abrirComissao();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Registrar pagamento' }));
    const input = screen.getByLabelText('Data de pagamento');

    fireEvent.change(input, { target: { value: '2026-07-09' } });
    fireEvent.submit(input.closest('form')!);

    expect(screen.getByRole('alert')).toHaveTextContent('entre a data da NF e hoje');
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('mostra no diálogo o erro de validação do backend', async () => {
    mockLista([comissao({})]);
    mocks.patch.mockRejectedValue({ response: { status: 400, data: { error: { message: 'Data de pagamento não pode ser futura.' } } } });
    await abrirComissao();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Registrar pagamento' }));
    fireEvent.change(screen.getByLabelText('Data de pagamento'), { target: { value: '2026-07-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));

    expect(await screen.findByText('Data de pagamento não pode ser futura.')).toBeInTheDocument();
    expect(screen.getByLabelText('Data de pagamento')).toBeInTheDocument();
  });

  it('pendente não oferece pagamento (backend exige faturado ou bloqueado)', async () => {
    mockLista([comissao({ status: 'pendente' })]);
    await abrirComissao();
    await abrirMenu();

    expect(screen.queryByRole('menuitem', { name: 'Registrar pagamento' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Atraso de pagamento' })).toBeInTheDocument();
  });

  it('atraso pede confirmação antes de bloquear', async () => {
    mockLista([comissao({})]);
    await abrirComissao();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Atraso de pagamento' }));
    expect(mocks.patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar atraso' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/financeiro/comissoes/c1/atraso', { version: 3 }));
  });

  it('estorno só aparece em comissão paga, pede confirmação e envia a versão', async () => {
    mockLista([comissao({ status: 'pago', data_pagamento: '2026-07-20' })]);
    await abrirComissao();
    expect(await screen.findByText('Pago em 20/07/2026')).toBeInTheDocument();
    await abrirMenu();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Estornar pagamento']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Estornar pagamento' }));
    expect(screen.getByText(/O pagamento de 20\/07\/2026 será desfeito/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Estornar' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith('/financeiro/comissoes/c1/estorno', { version: 3 }));
  });

  it('conflito de versão fecha o diálogo, recarrega e avisa', async () => {
    mockLista([comissao({ status: 'pago', data_pagamento: '2026-07-20' })]);
    mocks.patch.mockRejectedValue({ response: { status: 409, data: { error: { code: 'CONCURRENT_MODIFICATION' } } } });
    await abrirComissao();
    await abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Estornar pagamento' }));
    const antes = chamadasLista().length;

    fireEvent.click(screen.getByRole('button', { name: 'Estornar' }));

    expect(await screen.findByText(/Registro alterado por outro usuário/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Estornar' })).not.toBeInTheDocument();
    await waitFor(() => expect(chamadasLista().length).toBeGreaterThan(antes));
  });

  it('sem financeiro.editar não há coluna nem menu de ações', async () => {
    mocks.canEdit = false;
    mockLista([comissao({})]);
    await abrirComissao();
    await screen.findByText('Fornecedor Um');

    expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ações da comissão/ })).not.toBeInTheDocument();
  });
});
