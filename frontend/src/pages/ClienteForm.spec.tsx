// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClienteForm from './ClienteForm';
import api from '@/lib/apiClient';
import { lookupCnpj } from '@/services/consultas.service';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));
vi.mock('@/lib/fetchAllPages', () => ({ fetchAllPages: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock('@/services/consultas.service', () => ({ lookupCnpj: vi.fn() }));

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
  render(<ClienteForm />);
  fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '12345678000190' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar CNPJ' }));
}

describe('ClienteForm — disponibilidade do CNPJ', () => {
  it('avisa duplicidade antes de consultar fonte externa', async () => {
    get.mockResolvedValueOnce({ data: { data: { available: false } } } as never);

    preencherCnpj();

    expect(await screen.findByRole('alert')).toHaveTextContent('Este CNPJ já existe no cadastro de clientes.');
    expect(consultar).not.toHaveBeenCalled();
  });

  it('consulta fonte externa quando CNPJ está disponível', async () => {
    preencherCnpj();

    await waitFor(() => expect(consultar).toHaveBeenCalledWith('12345678000190', expect.anything()));
    expect(screen.getByLabelText(/Razão Social/)).toHaveValue('Empresa consultada');
  });

  it('ignora resposta de disponibilidade após usuário trocar CNPJ', async () => {
    let responder!: (value: unknown) => void;
    get.mockImplementationOnce(() => new Promise((resolve) => { responder = resolve; }) as never);
    render(<ClienteForm />);
    const cnpj = screen.getByLabelText('CNPJ');

    fireEvent.change(cnpj, { target: { value: '12345678000190' } });
    fireEvent.blur(cnpj);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.change(cnpj, { target: { value: '98765432000100' } });
    await act(async () => responder({ data: { data: { available: false } } }));

    expect(cnpj).toHaveValue('98.765.432/0001-00');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
