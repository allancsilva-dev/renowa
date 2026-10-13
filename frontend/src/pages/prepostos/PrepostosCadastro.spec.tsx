// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrepostosCadastro from './PrepostosCadastro';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), permissions: new Set<string>(),
}));

vi.mock('@/services/prepostos.service', () => ({
  fetchPrepostos: (...args: unknown[]) => mocks.fetch(...args),
  createPreposto: (...args: unknown[]) => mocks.create(...args),
  updatePreposto: (...args: unknown[]) => mocks.update(...args),
  deletePreposto: (...args: unknown[]) => mocks.remove(...args),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: (slug: string) => mocks.permissions.has(slug) }) }));
vi.mock('@/components/Can', () => ({
  Can: ({ permission, children }: { permission: string; children: React.ReactNode }) => (mocks.permissions.has(permission) ? children : null),
}));

const PREPOSTO = {
  uuid: 'p1', version: 2, nome: 'Paula Preposta', documento: '52998224725', telefone: null,
  email: 'paula@exemplo.com', endereco_completo: null, percentual_comissao: '3.00',
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  mocks.fetch.mockResolvedValue({ data: [PREPOSTO], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.permissions.clear(); });

describe('Prepostos — cadastro', () => {
  it('lista com CPF mascarado e percentual', async () => {
    render(<PrepostosCadastro />);
    expect(await screen.findByText('Paula Preposta')).toBeInTheDocument();
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument();
    expect(screen.getByText('3%')).toBeInTheDocument();
  });

  it('cria com documento só dígitos, percentual numérico e uuid de criação', async () => {
    mocks.permissions.add('prepostos.criar');
    mocks.create.mockResolvedValue({});
    render(<PrepostosCadastro />);
    fireEvent.click(await screen.findByRole('button', { name: 'Novo Preposto' }));
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: '  Carlos  ' } });
    fireEvent.change(screen.getByLabelText('CPF/CNPJ'), { target: { value: '52998224725' } });
    fireEvent.change(screen.getByLabelText(/% Comissão/), { target: { value: '2.5' } });
    fireEvent.submit(screen.getByLabelText(/Nome/).closest('form')!);

    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Carlos', documento: '52998224725', percentual_comissao: 2.5, telefone: null, email: null,
      uuid: expect.any(String),
    })));
  });

  it('edita enviando a versão; sem permissão de editar o item nem aparece', async () => {
    render(<PrepostosCadastro />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ações de Paula Preposta' }));
    expect(screen.queryByRole('menuitem', { name: 'Editar' })).not.toBeInTheDocument();
    cleanup();

    mocks.permissions.add('prepostos.editar');
    mocks.update.mockResolvedValue({});
    render(<PrepostosCadastro />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ações de Paula Preposta' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText(/% Comissão/), { target: { value: '4' } });
    fireEvent.submit(screen.getByLabelText(/Nome/).closest('form')!);
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('p1', expect.objectContaining({ percentual_comissao: 4, version: 2 })));
  });

  it('exclui após confirmação, com a versão, e mostra o 409 do servidor', async () => {
    mocks.permissions.add('prepostos.deletar');
    mocks.remove.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { error: { message: 'Preposto tem pedidos em andamento.' } } } });
    render(<PrepostosCadastro />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ações de Paula Preposta' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Excluir', hidden: true }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('p1', 2));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
