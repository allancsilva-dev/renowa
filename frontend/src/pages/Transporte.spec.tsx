// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Transporte from './Transporte';
import api from '@/lib/apiClient';

vi.mock('@/lib/apiClient', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/components/Can', () => ({ Can: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/services/consultas.service', () => ({ lookupCnpj: vi.fn() }));

const get = vi.mocked(api.get);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Transporte — busca', () => {
  it('envia termo digitado para API e reinicia na primeira página', async () => {
    get.mockResolvedValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } },
    } as never);
    render(<Transporte />);
    await waitFor(() => expect(get).toHaveBeenCalled());

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar transportadoras' }), {
      target: { value: 'Rua Norte' },
    });

    await waitFor(() => expect(get).toHaveBeenLastCalledWith('/transportadoras', {
      params: { page: 1, limit: 20, search: 'Rua Norte' },
    }));
    expect(screen.getByText('Nenhuma transportadora encontrada')).toBeInTheDocument();
  });
});
