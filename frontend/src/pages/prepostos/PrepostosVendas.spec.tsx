// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrepostosVendas from './PrepostosVendas';

const mocks = vi.hoisted(() => ({
  vendas: vi.fn(), prepostos: vi.fn(), percentual: vi.fn(), pagamento: vi.fn(), permissions: new Set<string>(),
}));

vi.mock('@/services/prepostos.service', () => ({
  fetchPrepostoVendas: (...args: unknown[]) => mocks.vendas(...args),
  fetchPrepostos: (...args: unknown[]) => mocks.prepostos(...args),
  alterarPercentualVenda: (...args: unknown[]) => mocks.percentual(...args),
  registrarPagamentoVenda: (...args: unknown[]) => mocks.pagamento(...args),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: (slug: string) => mocks.permissions.has(slug) }) }));

const VENDA = {
  uuid: 'v1', version: 2, status: 'pendente', numero_nfe: 'NF-9', data_faturamento: '2026-10-01', data_pagamento: null,
  valor_faturado: '1000.00', perc_comissao: '3.00', valor_comissao: '30.00',
  preposto: { uuid: 'p1', nome: 'Paula' }, pedido: { uuid: 'ped', numero_pedido: 42, cliente: 'Cliente X' },
};

function resposta(rows: unknown[]) {
  return { data: rows, meta: { total: rows.length, page: 1, limit: 20, totalPages: 1, totais: { faturado: '1000.00', comissao_pendente: '30.00', comissao_paga: '0.00' } } };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  mocks.prepostos.mockResolvedValue({ data: [], meta: { page: 1, totalPages: 1 } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.permissions.clear(); });

describe('Prepostos — vendas', () => {
  it('mostra venda, comissão e totais', async () => {
    mocks.vendas.mockResolvedValue(resposta([VENDA]));
    render(<PrepostosVendas />);
    expect(await screen.findByText('NF-9')).toBeInTheDocument();
    expect(screen.getByText('Cliente X')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 30,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Comissão a pagar')).toBeInTheDocument();
  });

  it('período só filtra quando completo e na ordem certa', async () => {
    mocks.vendas.mockResolvedValue(resposta([]));
    render(<PrepostosVendas />);
    await waitFor(() => expect(mocks.vendas).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Faturamento a partir de'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByLabelText('Faturamento até'), { target: { value: '2026-10-01' } });
    expect(await screen.findByText('A data inicial não pode ser depois da final.')).toBeInTheDocument();
    expect(mocks.vendas).not.toHaveBeenCalledWith(expect.objectContaining({ data_inicio: '2026-10-05' }));

    fireEvent.change(screen.getByLabelText('Faturamento até'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(mocks.vendas).toHaveBeenLastCalledWith(expect.objectContaining({ data_inicio: '2026-10-05', data_fim: '2026-10-31' })));
  });

  it('ano pela metade não refaz a busca nem descarta o período aplicado', async () => {
    mocks.vendas.mockResolvedValue(resposta([VENDA]));
    render(<PrepostosVendas />);
    fireEvent.change(screen.getByLabelText('Faturamento a partir de'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Faturamento até'), { target: { value: '2026-10-31' } });
    await waitFor(() => expect(mocks.vendas).toHaveBeenLastCalledWith(expect.objectContaining({ data_inicio: '2026-10-01', data_fim: '2026-10-31' })));
    const chamadas = mocks.vendas.mock.calls.length;

    // Navegador emite um valor por dígito do ano: 0002, 0020, 0202, 2026.
    for (const value of ['0002-10-31', '0020-10-31', '0202-10-31']) {
      fireEvent.change(screen.getByLabelText('Faturamento até'), { target: { value } });
    }
    expect(mocks.vendas).toHaveBeenCalledTimes(chamadas);
    expect(screen.queryByText('A data inicial não pode ser depois da final.')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Faturamento até'), { target: { value: '2026-11-30' } });
    await waitFor(() => expect(mocks.vendas).toHaveBeenLastCalledWith(expect.objectContaining({ data_inicio: '2026-10-01', data_fim: '2026-11-30' })));
  });

  it('pagar exige financeiro.editar e envia data e versão', async () => {
    mocks.vendas.mockResolvedValue(resposta([VENDA]));
    mocks.permissions.add('prepostos.editar');
    render(<PrepostosVendas />);
    fireEvent.click(await screen.findByRole('button', { name: /Ações da NF NF-9/ }));
    expect(screen.queryByRole('menuitem', { name: 'Marcar como pago' })).not.toBeInTheDocument();
    cleanup();

    mocks.permissions.add('financeiro.editar');
    mocks.pagamento.mockResolvedValue({});
    render(<PrepostosVendas />);
    fireEvent.click(await screen.findByRole('button', { name: /Ações da NF NF-9/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Marcar como pago' }));
    fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-10-10' } });
    fireEvent.submit(screen.getByLabelText('Data do pagamento').closest('form')!);
    await waitFor(() => expect(mocks.pagamento).toHaveBeenCalledWith('v1', { data_pagamento: '2026-10-10', version: 2 }));
  });

  it('alterar % envia o novo percentual com a versão', async () => {
    mocks.vendas.mockResolvedValue(resposta([VENDA]));
    mocks.permissions.add('prepostos.editar');
    mocks.percentual.mockResolvedValue({});
    render(<PrepostosVendas />);
    fireEvent.click(await screen.findByRole('button', { name: /Ações da NF NF-9/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alterar %' }));
    fireEvent.change(screen.getByLabelText('Percentual de comissão'), { target: { value: '4.5' } });
    fireEvent.submit(screen.getByLabelText('Percentual de comissão').closest('form')!);
    await waitFor(() => expect(mocks.percentual).toHaveBeenCalledWith('v1', { perc_comissao: 4.5, version: 2 }));
  });

  it('venda paga oferece só estorno, com confirmação', async () => {
    mocks.vendas.mockResolvedValue(resposta([{ ...VENDA, status: 'pago', data_pagamento: '2026-10-10' }]));
    mocks.permissions.add('prepostos.editar');
    mocks.permissions.add('financeiro.editar');
    mocks.pagamento.mockResolvedValue({});
    render(<PrepostosVendas />);
    fireEvent.click(await screen.findByRole('button', { name: /Ações da NF NF-9/ }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Estornar pagamento']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Estornar pagamento' }));
    fireEvent.click(screen.getByRole('button', { name: 'Estornar', hidden: true }));
    await waitFor(() => expect(mocks.pagamento).toHaveBeenCalledWith('v1', { data_pagamento: null, version: 2 }));
  });
});
