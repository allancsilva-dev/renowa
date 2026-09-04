// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SacForm from './SacForm';

const fetchAllPages = vi.fn();

vi.mock('@/services/sac.service', () => ({ fetchSacTicket: vi.fn(), saveSacTicket: vi.fn() }));
vi.mock('@/services/clients.service', () => ({
  fetchClients: vi.fn(async () => ({ data: [], meta: { page: 1, totalPages: 1 } })),
}));
vi.mock('@/lib/fetchAllPages', () => ({ fetchAllPages: (...args: unknown[]) => fetchAllPages(...args) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({}) }));

beforeEach(() => {
  fetchAllPages.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SacForm — adicionar linha', () => {
  it('move ação para fim com múltiplas linhas e restaura no cabeçalho', async () => {
    render(<SacForm />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Itens' })).toBeInTheDocument());

    const section = screen.getByRole('heading', { name: 'Itens' }).closest('section')!;
    const topAction = screen.getByRole('button', { name: 'Adicionar linha' });
    expect(topAction.parentElement).toContainElement(screen.getByRole('heading', { name: 'Itens' }));

    fireEvent.click(topAction);
    expect(screen.getByText('Linha 2')).toBeInTheDocument();

    const bottomAction = screen.getByRole('button', { name: 'Adicionar linha' });
    expect(section.lastElementChild).toContainElement(bottomAction);
    fireEvent.click(bottomAction);

    expect(screen.getByText('Linha 3')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Adicionar linha' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover linha 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover linha 2' }));

    const restoredTopAction = screen.getByRole('button', { name: 'Adicionar linha' });
    expect(restoredTopAction.parentElement).toContainElement(screen.getByRole('heading', { name: 'Itens' }));
  });
});
