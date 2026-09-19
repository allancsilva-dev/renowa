// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClienteForm from './ClienteForm';
import api from '@/lib/apiClient';
import { lookupCnpj } from '@/services/consultas.service';

const rota = vi.hoisted(() => ({ params: {} as { uuid?: string } }));

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => rota.params }));
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
  rota.params = {};
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

describe('ClienteForm — transportadora pesquisável', () => {
  it('seleciona transportadora e exibe telefone e endereço', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/transportadoras') return {
        data: {
          data: [{
            uuid: 'trans-1', razao_social: 'Transportadora Norte', cnpj: null,
            telefone: '(11) 99999-0000', endereco_completo: 'Rua Norte, 10',
          }],
          meta: { page: 1, totalPages: 1 },
        },
      } as never;
      return { data: { data: { available: true } } } as never;
    });
    render(<ClienteForm />);

    fireEvent.focus(screen.getByRole('combobox', { name: 'Transportadora' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/transportadoras', {
      params: { search: '', page: 1, limit: 20 },
    }));
    fireEvent.click(await screen.findByRole('option', { name: /Transportadora Norte/ }));

    expect(screen.getByRole('combobox', { name: 'Transportadora' })).toHaveValue('Transportadora Norte');
    const details = screen.getAllByPlaceholderText('Selecione a transportadora');
    expect(details[0]).toHaveValue('(11) 99999-0000');
    expect(details[1]).toHaveValue('Rua Norte, 10');
  });
});

describe('ClienteForm — pagamento padrão', () => {
  it('oferece a lista canônica em cadastro novo', () => {
    render(<ClienteForm />);

    const pagamento = screen.getByLabelText('Pagamento padrão') as HTMLSelectElement;
    expect(pagamento.tagName).toBe('SELECT');
    expect([...pagamento.options].map((o) => o.value))
      .toEqual(['', 'BOL', 'BOL/BOL', 'BOL/CHEQUE', 'BOL/PIX', 'PIX']);

    fireEvent.change(pagamento, { target: { value: 'BOL/CHEQUE' } });
    expect(pagamento).toHaveValue('BOL/CHEQUE');
  });

  it('mantém o valor legado de cliente já cadastrado', async () => {
    // Cliente importado por CSV ou cadastrado antes da lista fixa.
    rota.params = { uuid: 'cli-legado' };
    get.mockImplementation(async (url: string) => (
      url.startsWith('/clientes/cli-legado')
        ? { data: { data: { uuid: 'cli-legado', razao_social: 'Cliente Legado', pgt_padrao: 'Boleto 30/60' } } }
        : { data: { data: { available: true } } }
    ) as never);

    render(<ClienteForm />);

    const pagamento = await screen.findByLabelText('Pagamento padrão') as HTMLSelectElement;
    await waitFor(() => expect(pagamento).toHaveValue('Boleto 30/60'));
    expect([...pagamento.options].map((o) => o.value)).toContain('Boleto 30/60');
  });
});
