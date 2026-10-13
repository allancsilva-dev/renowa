// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RowMenu } from './RowMenu';

afterEach(cleanup);

function setup() {
  const ver = vi.fn();
  const excluir = vi.fn();
  render(
    <RowMenu
      label='Ações do pedido #1'
      items={[
        { label: 'Ver', onSelect: ver },
        { label: 'Bloqueado', onSelect: vi.fn(), disabled: true },
        { label: 'Excluir', onSelect: excluir, danger: true },
      ]}
    />,
  );
  return { ver, excluir, trigger: screen.getByRole('button', { name: 'Ações do pedido #1' }) };
}

describe('RowMenu', () => {
  it('abre, foca o primeiro item habilitado e navega pulando desabilitados', () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Ver' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Ver' })).toHaveFocus();
  });

  it('Esc fecha e devolve o foco ao gatilho', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('clique fora fecha sem executar ação; item executa e fecha', () => {
    const { trigger, excluir } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(excluir).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(excluir).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sem nenhum item habilitado não renderiza gatilho', () => {
    render(<RowMenu label='Nada' items={[{ label: 'X', onSelect: vi.fn(), disabled: true }]} />);
    expect(screen.queryByRole('button', { name: 'Nada' })).not.toBeInTheDocument();
  });
});
