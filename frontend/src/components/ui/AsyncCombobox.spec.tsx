// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AsyncCombobox } from './AsyncCombobox';

const OPTIONS = [
  { value: '1', label: 'Cliente A' },
  { value: '2', label: 'Cliente B' },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AsyncCombobox', () => {
  it('aplica debounce sobre o texto digitado antes de chamar o fetcher', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue({ options: [], hasMore: false });
    render(<AsyncCombobox value={null} onChange={() => {}} fetcher={fetcher} ariaLabel='Cliente' />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'a' } });
    fireEvent.change(input, { target: { value: 'ac' } });
    fireEvent.change(input, { target: { value: 'ace' } });

    await vi.advanceTimersByTimeAsync(100);
    let calls = fetcher.mock.calls.map((args) => args[0]);
    expect(calls).not.toContain('ace');

    await vi.advanceTimersByTimeAsync(300);
    calls = fetcher.mock.calls.map((args) => args[0]);
    expect(calls).not.toContain('a');
    expect(calls).not.toContain('ac');
    expect(calls.filter((text) => text === 'ace')).toHaveLength(1);
  });

  it('exibe estado de carregamento enquanto busca', async () => {
    const fetcher = vi.fn(() => new Promise<never>(() => {}));
    render(<AsyncCombobox value={null} onChange={() => {}} fetcher={fetcher} ariaLabel='Cliente' />);

    fireEvent.focus(screen.getByRole('combobox'));

    expect(await screen.findByText('Carregando...')).toBeInTheDocument();
  });

  it('exibe estado vazio quando não há resultados', async () => {
    const fetcher = vi.fn().mockResolvedValue({ options: [], hasMore: false });
    render(
      <AsyncCombobox
        value={null}
        onChange={() => {}}
        fetcher={fetcher}
        ariaLabel='Cliente'
        emptyMessage='Nenhum cliente encontrado.'
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));

    expect(await screen.findByText('Nenhum cliente encontrado.')).toBeInTheDocument();
  });

  it('exibe estado de erro quando o fetcher falha', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('falha de rede'));
    render(
      <AsyncCombobox
        value={null}
        onChange={() => {}}
        fetcher={fetcher}
        ariaLabel='Cliente'
        errorMessage='Não foi possível buscar clientes.'
      />,
    );

    fireEvent.focus(screen.getByRole('combobox'));

    expect(await screen.findByText('Não foi possível buscar clientes.')).toBeInTheDocument();
  });

  it('permite navegar e selecionar opções via teclado', async () => {
    const fetcher = vi.fn().mockResolvedValue({ options: OPTIONS, hasMore: false });
    const onChange = vi.fn();
    render(<AsyncCombobox value={null} onChange={onChange} fetcher={fetcher} ariaLabel='Cliente' />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);

    await waitFor(() => expect(screen.getByText('Cliente A')).toBeInTheDocument());

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('1', OPTIONS[0]);
    expect(input).toHaveValue('Cliente A');
  });

  it('fecha o dropdown e restaura o texto ao pressionar Escape', async () => {
    const fetcher = vi.fn().mockResolvedValue({ options: OPTIONS, hasMore: false });
    render(
      <AsyncCombobox value='1' displayValue='Cliente A' onChange={() => {}} fetcher={fetcher} ariaLabel='Cliente' />,
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getByText('Cliente B')).toBeInTheDocument());

    fireEvent.change(input, { target: { value: 'Cliente X' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('Cliente A');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
