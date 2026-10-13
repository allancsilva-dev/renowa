// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Prepostos from './Prepostos';

vi.mock('@/pages/prepostos/PrepostosCadastro', () => ({ default: () => <p>conteudo cadastro</p> }));
vi.mock('@/pages/prepostos/PrepostosVendas', () => ({ default: () => <p>conteudo vendas</p> }));

afterEach(cleanup);

describe('Prepostos — abas', () => {
  it('abre em Cadastro e troca para Vendas por clique e por seta', () => {
    render(<MemoryRouter><Prepostos /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: 'Cadastro' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('conteudo cadastro')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Vendas' }));
    expect(screen.getByText('conteudo vendas')).toBeInTheDocument();
    expect(screen.queryByText('conteudo cadastro')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Cadastro' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cadastro' })).toHaveFocus();
  });

  it('?aba=vendas abre direto em Vendas', () => {
    render(<MemoryRouter initialEntries={['/prepostos?aba=vendas']}><Prepostos /></MemoryRouter>);
    expect(screen.getByRole('tab', { name: 'Vendas' })).toHaveAttribute('aria-selected', 'true');
  });
});
