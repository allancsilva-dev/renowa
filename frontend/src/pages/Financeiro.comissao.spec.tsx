// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  mocks.canEdit = true;
  // jsdom não implementa <dialog>; o atributo `open` deixa o conteúdo acessível às queries por role.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  mocks.patch.mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

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
