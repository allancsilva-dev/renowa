// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Financeiro from './Financeiro';

const mocks = vi.hoisted(() => ({ get: vi.fn(), navigate: vi.fn() }));

vi.mock('@/lib/apiClient', () => ({ default: { get: (...args: unknown[]) => mocks.get(...args) } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Financeiro — Faturados', () => {
  it('mostra uma nota parcial diretamente na aba e abre o detalhe do pedido', async () => {
    mocks.get.mockImplementation(async (url: string) => {
      if (url.startsWith('/financeiro/fluxo-caixa')) {
        return { data: { data: { receitas: '0.00', custos: '0.00', saldo: '0.00', lancamentos: [] } } };
      }
      if (url === '/financeiro/faturados') {
        return { data: {
          data: [{
            uuid: 'nota-1', numero_nota: '123', serie: '1', valor: '40.00', data_faturamento: '2026-09-15',
            pedido_uuid: 'pedido-1', numero_pedido: 10, cliente: 'Cliente Um', fornecedor_uuid: 'forn-1', fornecedor: 'Fornecedor Um',
          }],
          meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
        } };
      }
      if (url === '/financeiro/faturados/fornecedores') return { data: { data: [{ uuid: 'forn-1', razao_social: 'Fornecedor Um' }] } };
      throw new Error(`URL inesperada: ${url}`);
    });

    render(<Financeiro />);
    fireEvent.click(screen.getByRole('button', { name: 'Faturados' }));

    expect(await screen.findByText('123 / 1')).toBeInTheDocument();
    expect(screen.getByText('R$ 40,00')).toBeInTheDocument();
    expect(screen.getAllByText('Fornecedor Um').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhe' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/faturamento/pedido-1');
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/financeiro/faturados', expect.objectContaining({ params: expect.objectContaining({ mes: expect.any(Number), ano: expect.any(Number) }) })));
  });
});

describe('Financeiro — busca por nº pedido, CNPJ ou razão social', () => {
  const vazio = { data: { data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } } };

  function mockPadrao(overrides: (url: string, config?: { params?: Record<string, unknown> }) => unknown = () => undefined) {
    mocks.get.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
      const resposta = overrides(url, config);
      if (resposta !== undefined) return resposta;
      if (url.startsWith('/financeiro/fluxo-caixa')) {
        return { data: { data: { receitas: '0.00', custos: '0.00', saldo: '0.00', lancamentos: [] } } };
      }
      return vazio;
    });
  }

  it('Inadimplência envia a busca ao servidor e mostra estado vazio da busca', async () => {
    mockPadrao();
    render(<Financeiro />);
    fireEvent.click(screen.getByRole('button', { name: 'Inadimplência' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar inadimplência' }), { target: { value: ' Acme & Filhos ' } });

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/financeiro/inadimplencia', { params: { limit: 100, search: 'Acme & Filhos' } }));
    expect(await screen.findByText('Nenhum registro encontrado para a busca.')).toBeInTheDocument();
  });

  it('Empresas codifica o CNPJ com máscara na URL', async () => {
    mockPadrao();
    render(<Financeiro />);
    fireEvent.click(screen.getByRole('button', { name: 'Empresas' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar vendas por empresa' }), { target: { value: '12.345.678/0001-90' } });

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(expect.stringContaining('search=12.345.678%2F0001-90')));
  });

  it('Comissão envia a busca na listagem, não no resumo do período', async () => {
    mockPadrao((url) => (url.startsWith('/financeiro/comissoes/resumo') ? { data: { total: '0.00', faturado: '0.00', pendente: '0.00', pago: '0.00' } } : undefined));
    render(<Financeiro />);
    fireEvent.click(screen.getByRole('button', { name: 'Comissão' }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar comissões' }), { target: { value: '1234' } });

    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(expect.stringMatching(/^\/financeiro\/comissoes\?.*search=1234/)));
    expect(mocks.get).not.toHaveBeenCalledWith(expect.stringMatching(/comissoes\/resumo.*search=/));
  });

  it('Parceiros descarta resposta de busca antiga que chega depois da atual', async () => {
    let liberarAntiga: (value: unknown) => void = () => {};
    const parceiro = (nome: string) => ({ data: { data: [{
      uuid: nome, version: 1, nome_parceiro: nome, empresa_parceiro: null, cliente: null, fornecedor: null,
      numero_pedido: null, numero_nfe: null, data_pedido: '2026-09-01', valor_pedido: '0.00', valor_comissao: '10.00', status: 'pendente',
    }], meta: { total: 1, page: 1, limit: 100, totalPages: 1 } } });
    mockPadrao((url, config) => {
      if (url !== '/financeiro/parceiros') return undefined;
      if (!config?.params?.search) return vazio;
      if (config.params.search === 'antiga') return new Promise((resolve) => { liberarAntiga = resolve; });
      return parceiro('Parceiro Atual');
    });

    render(<Financeiro />);
    fireEvent.click(screen.getByRole('button', { name: 'Parceiros' }));
    const busca = await screen.findByRole('searchbox', { name: 'Buscar parceiros' });
    fireEvent.change(busca, { target: { value: 'antiga' } });
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/financeiro/parceiros', expect.objectContaining({ params: expect.objectContaining({ search: 'antiga' }) })));
    fireEvent.change(busca, { target: { value: 'atual' } });
    expect(await screen.findByText('Parceiro Atual')).toBeInTheDocument();

    liberarAntiga(parceiro('Parceiro Antigo'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('Parceiro Antigo')).not.toBeInTheDocument();
    expect(screen.getByText('Parceiro Atual')).toBeInTheDocument();
  });
});
