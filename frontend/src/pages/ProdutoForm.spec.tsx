// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProdutoForm from './ProdutoForm';
import { FotoDoProdutoNaoEnviadaError } from '@/services/products.service';

/**
 * P1-1: o POST criava o produto e o upload da foto vinha depois. Falhando o
 * upload, a tela mostrava o erro e ficava parada — sem contar que o produto JÁ
 * estava salvo. O segundo clique em Salvar gerava uuid novo e criava um segundo
 * produto no catálogo.
 *
 * O que precisa continuar valendo: a identidade não muda entre tentativas, e a
 * segunda tentativa não repete a criação.
 */

const salvarProdutoNovo = vi.fn();
const navigate = vi.fn();

vi.mock('@/services/products.service', async () => {
  const real = await vi.importActual<typeof import('@/services/products.service')>(
    '@/services/products.service',
  );
  return {
    ...real,
    salvarProdutoNovo: (...args: unknown[]) => salvarProdutoNovo(...args),
  };
});
vi.mock('@/components/products/ProductPhotoField', () => ({
  default: ({ onPendingChange }: { onPendingChange?: (file: File | null) => void }) => (
    <button
      type='button'
      onClick={() => onPendingChange?.(new File(['x'], 'foto.jpg', { type: 'image/jpeg' }))}
    >
      escolher foto
    </button>
  ),
}));
vi.mock('@/components/ui/AsyncCombobox', () => ({
  AsyncCombobox: ({ onChange }: { onChange: (v: string, o: { label: string }) => void }) => (
    <button type='button' onClick={() => onChange('forn-1', { label: 'Fornecedor Um' })}>
      escolher fornecedor
    </button>
  ),
}));
vi.mock('@/services/suppliers.service', () => ({ fetchSuppliers: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useParams: () => ({}),
}));
vi.mock('@/lib/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

const produto = { uuid: 'gerado-na-tela', descricao: 'Produto A' };

beforeEach(() => {
  salvarProdutoNovo.mockResolvedValue(produto);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Preenche o mínimo que o form exige e devolve o botão de submit. */
async function preencher() {
  render(<ProdutoForm />);
  fireEvent.change(screen.getByLabelText(/Descrição/), { target: { value: 'Produto A' } });
  fireEvent.click(screen.getByText('escolher fornecedor'));
  fireEvent.click(screen.getByText('escolher foto'));
  return screen.getByRole('button', { name: 'Salvar' });
}

const chamada = (n: number) => salvarProdutoNovo.mock.calls[n][0];

describe('ProdutoForm — criação com foto', () => {
  it('salva com um uuid próprio e navega no caminho feliz', async () => {
    const salvar = await preencher();

    fireEvent.click(salvar);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/produtos'));
    expect(chamada(0)).toMatchObject({ jaCriado: false });
    expect(chamada(0).uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(chamada(0).payload.quantidade).toBe(1);
  });

  it('permite alterar quantidade enviada no cadastro', async () => {
    const salvar = await preencher();
    fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: '6' } });

    fireEvent.click(salvar);

    await waitFor(() => expect(salvarProdutoNovo).toHaveBeenCalledTimes(1));
    expect(chamada(0).payload.quantidade).toBe(6);
  });

  it('foto falhando: avisa que o produto foi salvo e não navega', async () => {
    salvarProdutoNovo.mockRejectedValueOnce(
      new FotoDoProdutoNaoEnviadaError(produto as never, new Error('rede')),
    );
    const salvar = await preencher();

    fireEvent.click(salvar);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/produto foi salvo/i));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tentar enviar a foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar sem a foto' })).toBeInTheDocument();
  });

  /** O núcleo do P1-1: a retentativa não pode virar um segundo produto. */
  it('a segunda tentativa reusa o uuid e não repete a criação', async () => {
    salvarProdutoNovo.mockRejectedValueOnce(
      new FotoDoProdutoNaoEnviadaError(produto as never, new Error('rede')),
    );
    const salvar = await preencher();

    fireEvent.click(salvar);
    await screen.findByRole('button', { name: 'Tentar enviar a foto' });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar enviar a foto' }));

    await waitFor(() => expect(salvarProdutoNovo).toHaveBeenCalledTimes(2));
    expect(chamada(1).uuid).toBe(chamada(0).uuid);
    expect(chamada(1).jaCriado).toBe(true);
  });

  it('falha ANTES de criar mantém o fluxo de criação — nada foi salvo', async () => {
    salvarProdutoNovo.mockRejectedValueOnce(new Error('fornecedor inválido'));
    const salvar = await preencher();

    fireEvent.click(salvar);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).not.toHaveTextContent(/produto foi salvo/i);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(salvarProdutoNovo).toHaveBeenCalledTimes(2));
    // Mesmo uuid, e ainda como criação: o servidor reconhece o reenvio.
    expect(chamada(1).uuid).toBe(chamada(0).uuid);
    expect(chamada(1).jaCriado).toBe(false);
  });
});
