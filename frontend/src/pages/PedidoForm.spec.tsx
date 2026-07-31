// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PedidoForm from './PedidoForm';

/**
 * BACKLOG-0066: trocar o fornecedor executava `setItems([newItem()])` e
 * descartava toda linha digitada, sem aviso e sem undo. Em edição isso também
 * perdia os `uuid` dos itens persistidos — e como o PUT manda `itens` completo,
 * o save seguinte apagava os itens no backend.
 */

const saveOrder = vi.fn();
const fetchOrder = vi.fn();
const fetchAllPages = vi.fn();

vi.mock('@/services/orders.service', () => ({
  fetchOrder: (...args: unknown[]) => fetchOrder(...args),
  saveOrder: (...args: unknown[]) => saveOrder(...args),
  liberarOrder: vi.fn(),
}));
vi.mock('@/services/clients.service', () => ({
  fetchClients: vi.fn(async () => ({
    data: [{ uuid: 'cli-1', razao_social: 'Cliente Um', cnpj: null }],
    meta: { page: 1, totalPages: 1 },
  })),
}));
vi.mock('@/lib/fetchAllPages', () => ({ fetchAllPages: (...args: unknown[]) => fetchAllPages(...args) }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasAnyRole: () => false, hasPermission: () => true }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

const FORNECEDOR_A = { uuid: 'forn-a', razao_social: 'Fornecedor A' };
const FORNECEDOR_B = { uuid: 'forn-b', razao_social: 'Fornecedor B' };
const PRODUTO_A = { uuid: 'prod-a', codigo: 'AAA-1', descricao: 'Produto A', preco_base: '25.50', ipi_perc: '10' };
const PRODUTO_B = { uuid: 'prod-b', codigo: 'BBB-1', descricao: 'Produto B', preco_base: '30.00', ipi_perc: '5' };

beforeEach(() => {
  // `products` é recarregado por fornecedor; os demais recursos são fixos.
  fetchAllPages.mockImplementation(async (path: string, params?: { fornecedor_uuid?: string }) => {
    if (path === '/fornecedores') return [FORNECEDOR_A, FORNECEDOR_B];
    if (path === '/produtos') return params?.fornecedor_uuid === 'forn-b' ? [PRODUTO_B] : [PRODUTO_A];
    return [];
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Renderiza, espera o fetch inicial e devolve os campos usados pelos casos. */
async function montar() {
  render(<PedidoForm />);
  await waitFor(() => expect(screen.getByLabelText(/Fornecedor/)).toBeInTheDocument());
  return {
    fornecedor: screen.getByLabelText(/Fornecedor/) as HTMLSelectElement,
    produto: () => screen.getByLabelText('Produto cadastrado') as HTMLSelectElement,
    caixas: () => screen.getByLabelText('Caixas') as HTMLInputElement,
    desconto: () => screen.getByLabelText('Desconto (%)') as HTMLInputElement,
    ipi: () => screen.getByLabelText('IPI (%)') as HTMLInputElement,
    codigo: () => screen.getByLabelText('Código') as HTMLInputElement,
  };
}

describe('PedidoForm — troca de fornecedor', () => {
  it('preserva as linhas e só desvincula o produto', async () => {
    const campos = await montar();

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-a' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /AAA-1/ })).toBeInTheDocument());
    fireEvent.change(campos.produto(), { target: { value: 'prod-a' } });
    fireEvent.change(campos.caixas(), { target: { value: '4' } });
    fireEvent.change(campos.desconto(), { target: { value: '10' } });
    expect(campos.ipi()).toHaveValue(10);

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-b' } });

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument();
    expect(campos.caixas()).toHaveValue(4);
    expect(campos.desconto()).toHaveValue(10);
    expect(campos.ipi()).toHaveValue(10);
    expect(campos.produto()).toHaveValue('');
    expect(campos.produto()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('1 item precisa de um novo produto');
  });

  it('reselecionar o mesmo fornecedor não mexe na linha', async () => {
    const campos = await montar();

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-a' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /AAA-1/ })).toBeInTheDocument());
    fireEvent.change(campos.produto(), { target: { value: 'prod-a' } });

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-a' } });

    expect(campos.produto()).toHaveValue('prod-a');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('linha manual não depende de fornecedor e fica intacta', async () => {
    const campos = await montar();

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-a' } });
    fireEvent.change(campos.codigo(), { target: { value: 'MANUAL-9' } });

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-b' } });

    expect(campos.codigo()).toHaveValue('MANUAL-9');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('bloqueia o save enquanto a linha estiver sem produto e libera ao escolher outro', async () => {
    const campos = await montar();

    fireEvent.change(campos.fornecedor, { target: { value: 'forn-a' } });
    await waitFor(() => expect(screen.getByRole('option', { name: /AAA-1/ })).toBeInTheDocument());
    fireEvent.change(campos.produto(), { target: { value: 'prod-a' } });
    fireEvent.change(campos.fornecedor, { target: { value: 'forn-b' } });

    // Cliente é obrigatório e é checado antes dos itens no `submit()`.
    fireEvent.focus(screen.getByRole('combobox', { name: 'Cliente' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Cliente Um' }));

    // Submit direto no form: o combobox de cliente é `required` no DOM, então
    // clicar no botão pararia antes, na validação nativa do navegador.
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar pedido' }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cada item precisa de um produto ou de código/descrição manual.',
    );
    expect(saveOrder).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByRole('option', { name: /BBB-1/ })).toBeInTheDocument());
    fireEvent.change(campos.produto(), { target: { value: 'prod-b' } });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(campos.produto()).not.toHaveAttribute('aria-invalid');
  });
});
