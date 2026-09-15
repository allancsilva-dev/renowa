// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Produtos from './Produtos';

const fetchProducts = vi.fn();

vi.mock('@/services/products.service', () => ({
  fetchProducts: (...args: unknown[]) => fetchProducts(...args),
  importProducts: vi.fn(),
  downloadProductsXlsxTemplate: vi.fn(),
}));
vi.mock('@/services/suppliers.service', () => ({ fetchSuppliers: vi.fn() }));
vi.mock('@/components/ui/AsyncCombobox', () => ({
  AsyncCombobox: ({ ariaLabel, onChange }: {
    ariaLabel: string;
    onChange: (value: string | null, option: { label: string } | null) => void;
  }) => (
    <div aria-label={ariaLabel}>
      <button type='button' onClick={() => onChange('forn-1', { label: 'Fornecedor Um' })}>filtrar fornecedor</button>
      <button type='button' onClick={() => onChange(null, null)}>limpar fornecedor</button>
    </div>
  ),
}));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const response = {
  data: [
    { uuid: 'p1', descricao: 'Produto Um', codigo: 'A1', quantidade: 1200, preco_base: null, ipi_perc: null, fornecedor: { uuid: 'forn-1', razao_social: 'Fornecedor Um' } },
    { uuid: 'p2', descricao: 'Produto Legado', codigo: null, quantidade: 0, preco_base: null, ipi_perc: null, fornecedor: null },
  ],
  meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
};

beforeEach(() => fetchProducts.mockResolvedValue(response));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Produtos — quantidade e fornecedor', () => {
  it('mostra colunas, quantidade pt-BR, fornecedor e fallback legado', async () => {
    render(<Produtos />);
    await screen.findByText('Produto Um');

    expect(screen.getByRole('columnheader', { name: 'Unidades por caixa' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fornecedor' })).toBeInTheDocument();
    expect(screen.getByText('1.200')).toBeInTheDocument();
    expect(screen.getByText('Fornecedor Um')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('combina busca e filtro por UUID e remove filtro ao limpar', async () => {
    render(<Produtos />);
    await screen.findByText('Produto Um');
    fireEvent.change(screen.getByPlaceholderText('Buscar produto...'), { target: { value: 'parafuso' } });
    fireEvent.click(screen.getByRole('button', { name: 'filtrar fornecedor' }));

    await waitFor(() => expect(fetchProducts).toHaveBeenCalledWith(expect.objectContaining({
      page: 1, search: 'parafuso', fornecedor_uuid: 'forn-1',
    })));

    fireEvent.click(screen.getByRole('button', { name: 'limpar fornecedor' }));
    await waitFor(() => {
      const last = fetchProducts.mock.calls.at(-1)?.[0];
      expect(last).toMatchObject({ page: 1, search: 'parafuso' });
      expect(last.fornecedor_uuid).toBeUndefined();
    });
  });
});
