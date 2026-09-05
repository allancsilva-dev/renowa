// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FornecedorForm from './FornecedorForm';
import api from '@/lib/apiClient';
import { lookupCnpj } from '@/services/consultas.service';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/lib/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('@/services/consultas.service', () => ({ lookupCnpj: vi.fn() }));
vi.mock('@/services/suppliers.service', () => ({
  fetchSupplier: vi.fn(), createSupplier: vi.fn(), updateSupplier: vi.fn(),
}));

const get = vi.mocked(api.get);
const consultar = vi.mocked(lookupCnpj);

beforeEach(() => {
  get.mockResolvedValue({ data: { data: { available: true } } } as never);
  consultar.mockResolvedValue({ razao_social: 'Empresa consultada' } as never);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function preencherCnpj() {
  render(<FornecedorForm />);
  fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '12345678000190' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar CNPJ' }));
}

describe('FornecedorForm — disponibilidade do CNPJ', () => {
  it('avisa duplicidade antes de consultar fonte externa', async () => {
    get.mockResolvedValueOnce({ data: { data: { available: false } } } as never);

    preencherCnpj();

    expect(await screen.findByRole('alert')).toHaveTextContent('Este CNPJ já existe no cadastro de fornecedores.');
    expect(consultar).not.toHaveBeenCalled();
  });

  it('consulta fonte externa quando CNPJ está disponível', async () => {
    preencherCnpj();

    await waitFor(() => expect(consultar).toHaveBeenCalledWith('12345678000190', expect.anything()));
    expect(screen.getByLabelText(/Razão Social/)).toHaveValue('Empresa consultada');
  });
});
