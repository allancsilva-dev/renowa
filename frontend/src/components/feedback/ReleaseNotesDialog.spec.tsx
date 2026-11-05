// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReleaseNotesDialog from './ReleaseNotesDialog';
import { useReleaseNotes } from '@/hooks/useReleaseNotes';
import type { ReleaseNote } from '@/lib/releaseNotes';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ default: { get: mocks.get, patch: mocks.patch } }));

const NOTES: ReleaseNote[] = [
  { version: '1.2.0', date: '2026-11-05', commit: 'abc1234', items: [
    { tipo: 'correcao', texto: 'O filtro de datas ficou mais preciso.' },
    { tipo: 'novo', texto: 'Agora você pode ver os vendedores no Financeiro.' },
  ] },
  { version: '1.1.0', date: '2026-10-01', commit: 'def5678', items: [
    { tipo: 'melhoria', texto: 'A lista de pedidos abre mais rápido.' },
  ] },
];

function Harness() {
  const { pending, dismiss } = useReleaseNotes(NOTES);
  return <ReleaseNotesDialog open={pending.length > 0} notes={pending} onClose={dismiss} />;
}

const state = (s: object) => Promise.resolve({ data: { data: { supported: true, createdAt: '2026-01-01T00:00:00.000Z', ...s } } });

beforeEach(() => {
  cleanup();
  mocks.get.mockReset();
  mocks.patch.mockReset().mockResolvedValue({ data: null });
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

describe('Novidades após atualização', () => {
  it('abre com a versão que o usuário ainda não viu, novidade antes de correção', async () => {
    mocks.get.mockReturnValue(state({ seenVersion: '1.1.0' }));
    render(<Harness />);

    expect(await screen.findByText('O que há de novo')).toBeInTheDocument();
    expect(screen.getByText(/5 de novembro de 2026/)).toBeInTheDocument();
    expect(screen.queryByText('A lista de pedidos abre mais rápido.')).not.toBeInTheDocument();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toMatch(/^Novidade/);
    expect(items[1]).toMatch(/^Corrigido/);
    expect(mocks.get).toHaveBeenCalledWith('/users/me/release-notes', expect.anything());
  });

  it('não abre quando já viu a mais recente', async () => {
    mocks.get.mockReturnValue(state({ seenVersion: '1.2.0' }));
    render(<Harness />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.queryByText('O que há de novo')).not.toBeInTheDocument();
  });

  it('não abre sem suporte (usuário sem cadastro no tenant)', async () => {
    mocks.get.mockReturnValue(Promise.resolve({ data: { data: { supported: false, seenVersion: null, createdAt: null } } }));
    render(<Harness />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.queryByText('O que há de novo')).not.toBeInTheDocument();
  });

  it('erro ao consultar não abre nem quebra a tela', async () => {
    mocks.get.mockReturnValue(Promise.reject(new Error('rede')));
    render(<Harness />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    expect(screen.queryByText('O que há de novo')).not.toBeInTheDocument();
  });

  it('"Entendi" fecha e grava a versão mais recente uma única vez', async () => {
    mocks.get.mockReturnValue(state({ seenVersion: null }));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Entendi' }));

    await waitFor(() => expect(screen.queryByText('O que há de novo')).not.toBeInTheDocument());
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(mocks.patch).toHaveBeenCalledWith('/users/me/release-notes', { version: '1.2.0' });
  });

  it('fechar pelo X também grava; falha ao gravar não impede fechar', async () => {
    mocks.patch.mockRejectedValue(new Error('rede'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.get.mockReturnValue(state({ seenVersion: null }));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar diálogo' }));

    await waitFor(() => expect(screen.queryByText('O que há de novo')).not.toBeInTheDocument());
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    await act(async () => {});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
