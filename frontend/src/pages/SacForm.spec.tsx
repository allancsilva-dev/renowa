// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SacForm from './SacForm';

const fetchAllPages = vi.fn();
const sacMocks = vi.hoisted(() => ({ fetch: vi.fn(), save: vi.fn() }));
const route = vi.hoisted(() => ({ uuid: undefined as string | undefined }));

vi.mock('@/services/sac.service', () => ({
  fetchSacTicket: (...args: unknown[]) => sacMocks.fetch(...args),
  saveSacTicket: (...args: unknown[]) => sacMocks.save(...args),
}));
vi.mock('@/services/clients.service', () => ({
  fetchClients: vi.fn(async () => ({ data: [], meta: { page: 1, totalPages: 1 } })),
}));
vi.mock('@/lib/fetchAllPages', () => ({ fetchAllPages: (...args: unknown[]) => fetchAllPages(...args) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ uuid: route.uuid }) }));

beforeEach(() => {
  fetchAllPages.mockResolvedValue([]);
  route.uuid = undefined;
});

describe('SacForm — normalização monetária', () => {
  function mockEditableTicket(valorUnitario: string) {
    route.uuid = 'sac-1';
    sacMocks.fetch.mockResolvedValue({
      uuid: 'sac-1', version: 3, status: 'aberto', data: '2026-09-19',
      cliente: { uuid: 'cliente-1', razao_social: 'Cliente' },
      fornecedor: { uuid: 'fornecedor-1', razao_social: 'Fornecedor' },
      numero_nfe: null, observacao: null,
      itens: [{ uuid: 'item-1', produto: null, codigo: 'ABC', quantidade: '1', motivo: 'Teste', valor_unitario: valorUnitario }],
    });
    sacMocks.save.mockResolvedValue({ uuid: 'sac-1' });
  }

  it('arredonda no blur, atualiza a tela e envia o valor normalizado', async () => {
    mockEditableTicket('0.00');
    render(<SacForm />);
    await screen.findByRole('heading', { name: 'Editar chamado SAC' });
    const input = screen.getByLabelText('VL UNI. (NF) *');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1,005' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('1,01');
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar chamado' }).closest('form')!);

    await waitFor(() => expect(sacMocks.save).toHaveBeenCalled());
    expect(sacMocks.save.mock.calls[0][0]).toMatchObject({ itens: [{ valor_unitario: 1.01 }] });
  });

  it('normaliza no payload um valor carregado sem interação no campo', async () => {
    mockEditableTicket('1.005');

    render(<SacForm />);
    await screen.findByRole('heading', { name: 'Editar chamado SAC' });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar chamado' }).closest('form')!);

    await waitFor(() => expect(sacMocks.save).toHaveBeenCalled());
    expect(sacMocks.save.mock.calls[0][0]).toMatchObject({
      itens: [{ valor_unitario: 1.01 }],
    });
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SacForm — adicionar linha', () => {
  it('move ação para fim com múltiplas linhas e restaura no cabeçalho', async () => {
    render(<SacForm />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Itens' })).toBeInTheDocument());

    const section = screen.getByRole('heading', { name: 'Itens' }).closest('section')!;
    const topAction = screen.getByRole('button', { name: 'Adicionar linha' });
    expect(topAction.parentElement).toContainElement(screen.getByRole('heading', { name: 'Itens' }));

    fireEvent.click(topAction);
    expect(screen.getByText('Linha 2')).toBeInTheDocument();

    const bottomAction = screen.getByRole('button', { name: 'Adicionar linha' });
    expect(section.lastElementChild).toContainElement(bottomAction);
    fireEvent.click(bottomAction);

    expect(screen.getByText('Linha 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Adicionar linha' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover linha 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover linha 2' }));

    const restoredTopAction = screen.getByRole('button', { name: 'Adicionar linha' });
    expect(restoredTopAction.parentElement).toContainElement(screen.getByRole('heading', { name: 'Itens' }));
  });
});
