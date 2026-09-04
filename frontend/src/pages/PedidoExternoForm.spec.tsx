// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import PedidoExternoForm from './PedidoExternoForm';

const mocks = vi.hoisted(() => ({ fetchOrder: vi.fn() }));

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
  useNavigate: () => vi.fn(), useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams('duplicar=externo-fonte')],
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

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
    await waitFor(() => expect(screen.getByLabelText(/Fornecedor/)).toHaveValue('forn-1'));
    expect(screen.getByRole('combobox', { name: 'Cliente' })).toHaveValue('');
    expect(screen.getByLabelText('Número do pedido *')).toHaveValue('');
    expect(screen.getByLabelText('Sistema onde foi digitado *')).toHaveValue('SAP');
    expect(screen.getByLabelText(/Transportadora/)).toHaveValue('');
    expect(screen.getByLabelText(/Forma de pagamento/)).toHaveValue('');
    expect(screen.getByLabelText(/Local de entrega/)).toHaveValue('');
  });
});
