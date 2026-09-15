// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FaturamentoDetalhe from './FaturamentoDetalhe';

const mocks = vi.hoisted(() => ({ load: vi.fn(), finalizar: vi.fn(), reabrir: vi.fn() }));

vi.mock('@/services/faturamento.service', () => ({
  fetchFaturamentoPedidoDetalhe: (...args: unknown[]) => mocks.load(...args),
  finalizarFaturamento: (...args: unknown[]) => mocks.finalizar(...args),
  reabrirFaturamento: (...args: unknown[]) => mocks.reabrir(...args),
  atualizarNota: vi.fn(), excluirNota: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('@/components/ui/Dialog', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => open ? <div role='dialog' aria-label={title}>{children}</div> : null,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ uuid: 'pedido-1' }) }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('FaturamentoDetalhe — fechamento manual', () => {
  it('confirma o saldo explícito e envia versão/motivo', async () => {
    mocks.load.mockResolvedValue({
      uuid: 'pedido-1', version: 4, numero_pedido: 10, status: 'parcialmente_faturado',
      cliente: { razao_social: 'Cliente Um' }, fornecedor: { razao_social: 'Fornecedor Um' },
      valor: '42.85', total_faturado: '40.00', divergencia: '2.85', notas: [],
      finalizacao_ativa: null, finalizacoes: [],
    });
    mocks.finalizar.mockResolvedValue({});

    render(<FaturamentoDetalhe />);
    fireEvent.click(await screen.findByRole('button', { name: /Finalizar/ }));
    expect(screen.getByRole('dialog', { name: 'Finalizar saldo restante' })).toHaveTextContent('R$ 2,85');
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Diferença aceita' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar finalização' }));

    await waitFor(() => expect(mocks.finalizar).toHaveBeenCalledWith('pedido-1', expect.objectContaining({
      version: 4, motivo: 'Diferença aceita', uuid: expect.any(String),
    })));
  });

  it('mostra histórico e permite reabrir uma finalização ativa', async () => {
    mocks.load.mockResolvedValue({
      uuid: 'pedido-1', version: 5, numero_pedido: 10, status: 'faturado',
      cliente: null, fornecedor: null, valor: '42.85', total_faturado: '40.00', divergencia: '2.85', notas: [],
      finalizacao_ativa: { uuid: 'fin-1', version: 2, saldo_encerrado: '2.85', motivo: 'Ajuste', finalizadoPor: { nome: 'Ana' }, created_at: '2026-09-15', reaberto_at: null },
      finalizacoes: [{ uuid: 'fin-1', version: 2, saldo_encerrado: '2.85', motivo: 'Ajuste', finalizadoPor: { nome: 'Ana' }, created_at: '2026-09-15', reaberto_at: null }],
    });
    mocks.reabrir.mockResolvedValue({});

    render(<FaturamentoDetalhe />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reabrir faturamento' }));
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Emitir complemento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar reabertura' }));

    await waitFor(() => expect(mocks.reabrir).toHaveBeenCalledWith('pedido-1', {
      version: 5, finalizacao_version: 2, motivo: 'Emitir complemento',
    }));
  });
});
