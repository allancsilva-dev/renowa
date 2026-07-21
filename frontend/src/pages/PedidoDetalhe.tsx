import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Pencil } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { fetchOrder, updateOrderStatus } from '@/services/orders.service';
import type { Order, OrderStatus } from '@/types';
import { moneyForDisplay } from '@/lib/decimal';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import LoadingState from '@/components/feedback/LoadingState';
import ErrorState from '@/components/feedback/ErrorState';
import { OrderValidationPdf } from '@/components/orders/OrderValidationPdf';

const STATUS_LABELS: Record<OrderStatus, string> = {
  em_aberto: 'Em Aberto',
  concluido: 'Concluído',
  cancelado:  'Cancelado',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  em_aberto: 'bg-blue-100 text-blue-700',
  concluido: 'bg-green-100 text-green-700',
  cancelado:  'bg-red-100 text-red-700',
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PedidoDetalhe() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusValue, setStatusValue] = useState<OrderStatus>('em_aberto');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(() => {
    if (!uuid) return;
    setLoading(true);
    setError(null);
    fetchOrder(uuid)
      .then((data) => {
        setOrder(data);
        setStatusValue(data.status);
      })
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => { load(); }, [load]);

  async function handleStatusUpdate() {
    if (!order || !uuid) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      const updated = await updateOrderStatus(uuid, statusValue, order.version);
      setOrder(updated);
    } catch (err) {
      setStatusError(getApiErrorMessage(err));
    } finally {
      setStatusSaving(false);
    }
  }

  async function generatePdf() {
    if (!uuid) return;
    const previewWindow = window.open('', '_blank');
    setPdfLoading(true);
    setStatusError(null);
    try {
      const persisted = await fetchOrder(uuid);
      setOrder(persisted);
      const blob = await pdf(<OrderValidationPdf order={persisted} />).toBlob();
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `pedido-validacao-renowa-${persisted.numero_pedido ?? persisted.uuid}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      previewWindow?.close();
      setStatusError(getApiErrorMessage(err));
    } finally {
      setPdfLoading(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !order) {
    return <ErrorState title='Não foi possível carregar o pedido' description={error ?? undefined} onRetry={load} />;
  }

  return (
    <div className='max-w-4xl mx-auto space-y-4'>
      <button
        type='button'
        onClick={() => navigate('/pedidos')}
        className='flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900'
      >
        <ArrowLeft className='h-4 w-4' />
        Voltar para Pedidos
      </button>

      <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6 space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold text-slate-900'>
              {order.numero_pedido != null ? `Pedido #${order.numero_pedido}` : 'Pedido'}
            </h1>
            <p className='text-sm text-slate-500 mt-1'>
              {order.cliente?.razao_social ?? (order.cliente_id != null ? `Cliente ID ${order.cliente_id}` : 'Sem cliente')}
            </p>
          </div>
          <div className='flex flex-wrap items-center gap-2'><button type='button' onClick={() => navigate(`/pedidos/${order.uuid}/editar`)} className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'><Pencil className='h-4 w-4' />Editar</button><button type='button' onClick={generatePdf} disabled={pdfLoading} className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'><FileDown className='h-4 w-4' />{pdfLoading ? 'Gerando...' : 'Gerar PDF para validação'}</button><span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[order.status]}`}>{STATUS_LABELS[order.status]}</span></div>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Data</p>
            <p className='text-slate-800'>{formatDate(order.data)}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Total s/ Imposto</p>
            <p className='text-slate-800'>{order.total_sem_imposto != null ? BRL.format(moneyForDisplay(order.total_sem_imposto)) : '—'}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Total c/ Imposto</p>
            <p className='text-slate-800'>{order.total_com_imposto != null ? BRL.format(moneyForDisplay(order.total_com_imposto)) : '—'}</p>
          </div>
        </div>

        {order.observacao && (
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</p>
            <p className='text-sm text-slate-800 whitespace-pre-wrap'>{order.observacao}</p>
          </div>
        )}

        <div className='border-t border-slate-100 pt-4'>
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2'>Atualizar status</p>
          {statusError && (
            <div role='alert' className='mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
              {statusError}
            </div>
          )}
          <div className='flex flex-wrap items-center gap-3'>
            <select
              value={statusValue}
              onChange={(e) => setStatusValue(e.target.value as OrderStatus)}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            >
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button
              type='button'
              onClick={handleStatusUpdate}
              disabled={statusSaving || statusValue === order.status}
              className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'
            >
              {statusSaving ? 'Salvando...' : 'Atualizar status'}
            </button>
          </div>
        </div>
      </div>

      <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6'>
        <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'>Itens do pedido</h2>
        <p className='text-xs text-slate-600 mb-4'>Valores calculados e persistidos pelo servidor.</p>

        {order.itens.length === 0 ? (
          <p className='text-sm text-slate-500'>Nenhum item cadastrado neste pedido.</p>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <table className='min-w-[640px] w-full text-sm'>
              <thead>
                <tr className='border-b bg-primary text-white'>
                  <th className='px-4 py-2 text-left font-semibold'>Produto</th>
                  <th className='px-4 py-2 text-right font-semibold'>Qtd. Caixas</th>
                  <th className='px-4 py-2 text-right font-semibold'>Qtd. Unitária</th>
                  <th className='px-4 py-2 text-right font-semibold'>Qtd. total</th>
                  <th className='px-4 py-2 text-right font-semibold'>Preço</th>
                  <th className='px-4 py-2 text-right font-semibold'>Desconto</th>
                  <th className='px-4 py-2 text-right font-semibold'>IPI</th>
                  <th className='px-4 py-2 text-right font-semibold'>Total final</th>
                </tr>
              </thead>
              <tbody>
                {order.itens.map((item) => (
                  <tr key={item.uuid} className='border-b last:border-0'>
                    <td className='px-4 py-2'>{item.produto?.descricao ?? item.descricao_manual ?? '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.qtd_caixas ?? '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.qtd_unitaria ?? '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.qtd_total ?? '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.preco_unitario != null ? BRL.format(moneyForDisplay(item.preco_unitario)) : '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.desconto_perc != null ? `${item.desconto_perc}%` : '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.ipi_perc != null ? `${item.ipi_perc}%` : '—'}</td>
                    <td className='px-4 py-2 text-right font-medium'>{item.total_com_imposto != null ? BRL.format(moneyForDisplay(item.total_com_imposto)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
