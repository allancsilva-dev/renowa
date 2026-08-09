// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PedidoDetalhe from './PedidoDetalhe';
import type { Order } from '@/types';

const mocks = vi.hoisted(() => ({
  fetchOrder: vi.fn(),
  fetchFotos: vi.fn(),
  toBlob: vi.fn(),
}));

vi.mock('@/services/orders.service', () => ({
  fetchOrder: mocks.fetchOrder,
  liberarOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
}));
vi.mock('@/services/productPhotos.service', async () => {
  const real = await vi.importActual<typeof import('@/services/productPhotos.service')>(
    '@/services/productPhotos.service',
  );
  return { ...real, fetchFotosPorProduto: mocks.fetchFotos };
});
vi.mock('@react-pdf/renderer', async (importOriginal) => ({
  ...await importOriginal<typeof import('@react-pdf/renderer')>(),
  pdf: () => ({ toBlob: mocks.toBlob }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => false }) }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ uuid: 'pedido-uuid' }),
}));

const pedido = {
  uuid: 'pedido-uuid',
  version: 1,
  numero_pedido: 42,
  status: 'em_aberto',
  origem: 'interno',
  data: '2026-08-09',
  itens: [],
  notas: [],
  total_sem_imposto: '10',
  total_com_imposto: '10',
} as unknown as Order;

let anchorClick: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.fetchOrder.mockResolvedValue(pedido);
  mocks.fetchFotos.mockResolvedValue({});
  mocks.toBlob.mockResolvedValue(new Blob(['%PDF teste'], { type: 'application/pdf' }));
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:pedido-pdf'),
    revokeObjectURL: vi.fn(),
  });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function abrirTela() {
  render(<PedidoDetalhe />);
  return screen.findByRole('button', { name: /Gerar PDF para validação/i });
}

describe('PedidoDetalhe — geração do PDF', () => {
  it('abre a prévia durante o clique e também baixa o arquivo com o nome correto', async () => {
    const preview = {
      document: { write: vi.fn() },
      location: { href: '' },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
    const button = await abrirTela();

    fireEvent.click(button);

    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(preview.location.href).toBe('blob:pedido-pdf'));
    expect(anchorClick).toHaveBeenCalledOnce();
    const anchor = anchorClick.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('blob:pedido-pdf');
    expect(anchor.download).toBe('pedido-validacao-renowa-42.pdf');
  });

  it('mantém o download e orienta a liberar popups quando a prévia é bloqueada', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const button = await abrirTela();

    fireEvent.click(button);

    expect(await screen.findByRole('status')).toHaveTextContent(/PDF foi baixado.*libere popups/i);
    expect(anchorClick).toHaveBeenCalledOnce();
  });

  it('fecha a aba provisória e não baixa nada quando a geração falha', async () => {
    const preview = {
      document: { write: vi.fn() },
      location: { href: '' },
      close: vi.fn(),
    };
    vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
    mocks.toBlob.mockRejectedValueOnce(new Error('falha ao montar'));
    const button = await abrirTela();

    fireEvent.click(button);

    await waitFor(() => expect(preview.close).toHaveBeenCalledOnce());
    expect(anchorClick).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
