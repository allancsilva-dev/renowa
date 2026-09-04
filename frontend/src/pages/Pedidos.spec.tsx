// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Pedidos from './Pedidos';
import type { Order } from '@/types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), reload: vi.fn(), updateStatus: vi.fn(), permissions: new Set<string>(),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => mocks.permissions.has(permission) }),
}));
vi.mock('@/services/orders.service', () => ({
  fetchOrders: vi.fn(),
  updateOrderStatus: (...args: unknown[]) => mocks.updateStatus(...args),
}));
vi.mock('@/hooks/usePaginatedQuery', () => ({
  usePaginatedQuery: () => ({
    data: [
      { uuid: 'interno-1', version: 3, numero_pedido: 10, origem: 'interno', status: 'em_aberto', itens: [] },
      { uuid: 'externo-1', version: 2, numero_pedido: 11, origem: 'externo', status: 'faturado', itens: [] },
    ] as unknown as Order[],
    meta: null, isLoading: false, error: null, goToPage: vi.fn(), reload: mocks.reload,
  }),
}));
vi.mock('@/components/tables/DataTable', () => ({
  default: ({ columns, data }: { columns: Array<{ key: string; cell: (row: Order) => React.ReactNode }>; data: Order[] }) => (
    <div>{data.map((row) => <div key={row.uuid}>{columns.map((column) => <span key={column.key}>{column.cell(row)}</span>)}</div>)}</div>
  ),
}));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));

beforeEach(() => {
  mocks.permissions.clear();
  mocks.updateStatus.mockResolvedValue({});
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('Pedidos — menu de ações', () => {
  it('usa três pontos verticais e abre detalhes', async () => {
    render(<Pedidos />);
    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #10' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Ver detalhes' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/pedidos/interno-1');
  });

  it('duplica pedido interno e externo nas rotas corretas', async () => {
    mocks.permissions.add('pedidos.criar');
    render(<Pedidos />);

    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #10' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/pedidos/novo?duplicar=interno-1');

    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #11' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/pedidos/externo/novo?duplicar=externo-1');
  });

  it('cancela somente quando permitido e recarrega lista', async () => {
    mocks.permissions.add('pedidos.editar');
    render(<Pedidos />);

    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #10' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));

    await waitFor(() => expect(mocks.updateStatus).toHaveBeenCalledWith('interno-1', 'cancelado', 3));
    expect(mocks.reload).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #11' }));
    expect(screen.queryByRole('menuitem', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('esconde duplicação e cancelamento sem as permissões correspondentes', async () => {
    render(<Pedidos />);
    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #10' }));

    expect(await screen.findByRole('menuitem', { name: 'Ver detalhes' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Duplicar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Cancelar pedido' })).not.toBeInTheDocument();
  });

  it('navega por teclado, fecha com Escape e devolve foco ao gatilho', async () => {
    mocks.permissions.add('pedidos.criar');
    mocks.permissions.add('pedidos.editar');
    render(<Pedidos />);
    const trigger = screen.getByRole('button', { name: 'Opções do pedido #10' });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    const items = screen.getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());

    fireEvent.keyDown(menu, { key: 'End' });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('fecha ao clicar fora e mantém só um menu aberto', async () => {
    mocks.permissions.add('pedidos.criar');
    render(<Pedidos />);
    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #10' }));
    expect(await screen.findAllByRole('menu')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Opções do pedido #11' }));
    expect(await screen.findAllByRole('menu')).toHaveLength(1);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('abre acima do gatilho nas últimas linhas e permanece dentro do viewport', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    render(<Pedidos />);
    const trigger = screen.getByRole('button', { name: 'Opções do pedido #11' });
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 720, bottom: 764, left: 960, right: 1004, width: 44, height: 44, x: 960, y: 720, toJSON: () => ({}),
    });

    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    await waitFor(() => expect(menu).toHaveStyle({ top: '668px', left: '796px' }));
  });

  it('não cancela sem confirmação e mostra conflito devolvido pela API', async () => {
    mocks.permissions.add('pedidos.editar');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    mocks.updateStatus.mockRejectedValueOnce({ response: { status: 409, data: { error: { message: 'Pedido foi alterado por outro usuário.' } } } });
    render(<Pedidos />);
    const trigger = screen.getByRole('button', { name: 'Opções do pedido #10' });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mocks.updateStatus).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cancelar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pedido foi alterado por outro usuário.');
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });
});
