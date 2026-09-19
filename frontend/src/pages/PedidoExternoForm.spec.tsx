// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import PedidoExternoForm from './PedidoExternoForm';

const mocks = vi.hoisted(() => ({ fetchOrder: vi.fn() }));
const rota = vi.hoisted(() => ({ params: {} as { uuid?: string }, search: 'duplicar=externo-fonte' }));

vi.mock('@/services/orders.service', () => ({
  fetchOrder: (...args: unknown[]) => mocks.fetchOrder(...args),
  saveExternalOrder: vi.fn(), liberarOrder: vi.fn(),
}));
vi.mock('@/lib/fetchAllPages', () => ({
  fetchAllPages: vi.fn(async (path: string) => path === '/fornecedores'
    ? [{ uuid: 'forn-1', razao_social: 'Fornecedor Um' }]
    : []),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasAnyRole: () => false, hasPermission: () => true }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(), useParams: () => rota.params,
  useSearchParams: () => [new URLSearchParams(rota.search)],
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  rota.params = {};
  rota.search = 'duplicar=externo-fonte';
});

describe('PedidoExternoForm — duplicação', () => {
  it('copia dados de origem e limpa cliente, número e campos derivados', async () => {
    mocks.fetchOrder.mockResolvedValue({
      uuid: 'externo-fonte', origem: 'externo', status: 'faturado', data: '2025-01-01',
      cliente: { uuid: 'cli-antigo', razao_social: 'Cliente Antigo' },
      fornecedor: { uuid: 'forn-1', razao_social: 'Fornecedor Um' }, transportadora: { uuid: 'trans-1' },
      numero_pedido_externo: 'EXT-10', sistema_origem: 'SAP', total_com_imposto: '123.45',
      pgt: 'ANTIGO', prazo: '30 dias', local_entrega: 'Rua antiga', tipo_faturamento: 'Total', observacao: 'Copiar',
    });

    render(<PedidoExternoForm />);

    expect(await screen.findByRole('heading', { name: 'Duplicar pedido externo' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Fornecedor' })).toHaveValue('Fornecedor Um'));
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('');
    expect(screen.getByLabelText('Número do pedido *')).toHaveValue('');
    expect(screen.getByLabelText('Sistema onde foi digitado *')).toHaveValue('SAP');
    expect(screen.getByLabelText(/Transportadora/)).toHaveValue('');
    expect(screen.getByLabelText(/Forma de pagamento/)).toHaveValue('');
    expect(screen.getByLabelText(/Forma de pagamento/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/Local de entrega/)).toHaveValue('');
  });
});

describe('PedidoExternoForm — forma de pagamento', () => {
  it('mantém no select o valor legado do pedido em edição', async () => {
    rota.params = { uuid: 'externo-1' };
    rota.search = '';
    mocks.fetchOrder.mockResolvedValue({
      uuid: 'externo-1', version: 2, origem: 'externo', status: 'em_aberto', data: '2025-01-01',
      cliente: { uuid: 'cli-1', razao_social: 'Cliente Um' },
      fornecedor: { uuid: 'forn-1', razao_social: 'Fornecedor Um' }, transportadora: null,
      numero_pedido_externo: 'EXT-11', sistema_origem: 'SAP', total_com_imposto: '10.00',
      pgt: 'Boleto 30/60', prazo: null, local_entrega: null, tipo_faturamento: null, observacao: null,
    });

    render(<PedidoExternoForm />);

    const pagamento = await screen.findByLabelText(/Forma de pagamento/) as HTMLSelectElement;
    await waitFor(() => expect(pagamento).toHaveValue('Boleto 30/60'));
    expect([...pagamento.options].map((o) => o.value)).toEqual(
      ['', 'BOL', 'BOL/BOL', 'BOL/CHEQUE', 'BOL/PIX', 'PIX', 'Boleto 30/60'],
    );
  });
});
