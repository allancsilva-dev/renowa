import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Pencil, Trash2, Unlock, XCircle } from 'lucide-react';
import { deleteOrder, fetchOrder, liberarOrder, updateOrderStatus } from '@/services/orders.service';
import { orderStatusLabel, orderStatusColor, type Order } from '@/types';
import { moneyForDisplay, qtyForDisplay } from '@/lib/decimal';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { canCancelarPedido, canLiberarPedido } from '@/lib/orderPermissions';
import LoadingState from '@/components/feedback/LoadingState';
import ErrorState from '@/components/feedback/ErrorState';
import { Can } from '@/components/Can';
import { orderTotalsBreakdown } from '@/lib/orderCalculation';
import { useOrderPdf } from '@/hooks/useOrderPdf';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PedidoDetalhe() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { generate: generateOrderPdf, loadingUuid: pdfLoadingUuid, error: pdfError, warning: pdfWarning } = useOrderPdf({ onLoaded: setOrder });
  const pdfLoading = pdfLoadingUuid !== null;

  const load = useCallback(() => {
    if (!uuid) return;
    setLoading(true);
    setError(null);
    fetchOrder(uuid)
      .then(setOrder)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => { load(); }, [load]);

  async function handleLiberar() {
    if (!order || !uuid || deleting) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      await liberarOrder(uuid, order.version);
      navigate('/faturamento');
    } catch (err) {
      setStatusError(getApiErrorMessage(err));
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleCancelar() {
    if (!order || !uuid || deleting) return;
    if (!window.confirm('Cancelar este pedido? Essa ação não pode ser desfeita.')) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      await updateOrderStatus(uuid, 'cancelado', order.version);
      load();
    } catch (err) {
      setStatusError(getApiErrorMessage(err));
    } finally {
      setStatusSaving(false);
    }
  }

  async function handleExcluir() {
    if (!order || !uuid) return;
    if (!window.confirm('Excluir este pedido? Ele deixará de existir no sistema. Essa ação não pode ser desfeita.')) return;
    setDeleting(true);
    setStatusError(null);
    try {
      await deleteOrder(uuid, order.version);
      navigate('/pedidos', { replace: true });
    } catch (err) {
      setStatusError(getApiErrorMessage(err));
      setDeleting(false);
    }
  }

  function generatePdf() {
    if (!uuid || deleting) return;
    setStatusError(null);
    void generateOrderPdf(uuid);
  }

  if (loading) return <LoadingState />;
  if (error || !order) {
    return <ErrorState title='Não foi possível carregar o pedido' description={error ?? undefined} onRetry={load} />;
  }

  const canLiberar = canLiberarPedido(hasPermission, order.status);
  const canCancelar = canCancelarPedido(hasPermission, order.status);
  const isExterno = (order.origem ?? 'interno') === 'externo';
  const breakdown = orderTotalsBreakdown(order, order.itens ?? []);
  const editarPath = isExterno ? `/pedidos/externo/${order.uuid}/editar` : `/pedidos/${order.uuid}/editar`;
  const notas = order.notas ?? [];
  const divergencia = moneyForDisplay(order.divergencia ?? '0');

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
          <div className='flex flex-wrap items-center gap-2'>
            <Can permission='pedidos.editar'>
              <button type='button' disabled={deleting} onClick={() => navigate(editarPath)} className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60'><Pencil className='h-4 w-4' />Editar</button>
            </Can>
            <button type='button' onClick={generatePdf} disabled={pdfLoading || deleting} className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'><FileDown className='h-4 w-4' />{pdfLoading ? 'Gerando...' : order.status === 'em_aberto' || order.status === 'liberado' ? 'Gerar PDF para validação' : 'Baixar PDF do pedido'}</button>
            {canLiberar && (
              <button type='button' onClick={handleLiberar} disabled={statusSaving || deleting} className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>
                <Unlock className='h-4 w-4' />{statusSaving ? 'Liberando...' : 'Liberar pedido'}
              </button>
            )}
            {canCancelar && (
              <button type='button' onClick={handleCancelar} disabled={statusSaving || deleting} className='flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60'>
                <XCircle className='h-4 w-4' />{statusSaving ? 'Cancelando...' : 'Cancelar pedido'}
              </button>
            )}
            <Can permission='pedidos.deletar'>
              <button type='button' onClick={handleExcluir} disabled={deleting || statusSaving} className='flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60'>
                <Trash2 className='h-4 w-4' />{deleting ? 'Excluindo...' : 'Excluir pedido'}
              </button>
            </Can>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${orderStatusColor[order.status]}`}>{orderStatusLabel[order.status]}</span>
          </div>
        </div>

        {(statusError ?? pdfError) && (
          <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
            {statusError ?? pdfError}
          </div>
        )}

        {pdfWarning && (
          <div role='status' className='rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700'>
            {pdfWarning}
          </div>
        )}

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

        {/* Mesma decomposição do papel — pedido externo não tem itens e,
            portanto, não tem desconto nem IPI para decompor. */}
        {!isExterno && (order.itens?.length ?? 0) > 0 && (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg bg-slate-50 p-4 text-sm'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Valor bruto</p>
              <p className='text-slate-800'>{BRL.format(moneyForDisplay(breakdown.bruto))}</p>
            </div>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Desconto total</p>
              <p className='font-medium text-red-700'>{BRL.format(moneyForDisplay(breakdown.descontoTotal))}</p>
            </div>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>IPI total</p>
              <p className='text-slate-800'>{BRL.format(moneyForDisplay(breakdown.ipiTotal))}</p>
            </div>
          </div>
        )}

        {isExterno && (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-3 rounded-lg bg-violet-50 p-4 text-sm'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-violet-700'>Sistema de origem</p>
              <p className='text-slate-800'>{order.sistema_origem ?? '—'}</p>
            </div>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-violet-700'>Nº no sistema de origem</p>
              <p className='font-mono text-slate-800'>{order.numero_pedido_externo ?? '—'}</p>
            </div>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-violet-700'>Fornecedor</p>
              <p className='text-slate-800'>{order.fornecedor?.razao_social ?? '—'}</p>
            </div>
          </div>
        )}

        {order.observacao && (
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</p>
            <p className='text-sm text-slate-800 whitespace-pre-wrap'>{order.observacao}</p>
          </div>
        )}
      </div>

      {/* Pedido externo não tem itens: o valor é informado direto, então a
          tabela de itens não se aplica. */}
      {!isExterno && (
      <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6'>
        <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'>Itens do pedido</h2>
        <p className='text-xs text-slate-600 mb-4'>Valores calculados e persistidos pelo servidor.</p>

        {order.itens.length === 0 ? (
          <p className='text-sm text-slate-500'>Nenhum item cadastrado neste pedido.</p>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <table className='min-w-[720px] w-full text-sm'>
              <thead>
                <tr className='border-b bg-primary text-white'>
                  <th className='px-4 py-2 text-left font-semibold'>Produto</th>
                  <th className='px-4 py-2 text-right font-semibold'>Qtd. Caixas</th>
                  <th className='px-4 py-2 text-right font-semibold'>Qtd. Unitária</th>
                  <th className='px-4 py-2 text-right font-semibold'>Qtd. total</th>
                  <th className='px-4 py-2 text-right font-semibold'>Preço</th>
                  <th className='px-4 py-2 text-right font-semibold'>Vlr. c/ desc.</th>
                  <th className='px-4 py-2 text-right font-semibold'>Desconto</th>
                  <th className='px-4 py-2 text-right font-semibold'>IPI</th>
                  <th className='px-4 py-2 text-right font-semibold'>Total final</th>
                </tr>
              </thead>
              <tbody>
                {order.itens.map((item) => (
                  <tr key={item.uuid} className='border-b last:border-0'>
                    <td className='px-4 py-2'>{item.produto?.descricao ?? item.descricao_manual ?? '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.qtd_caixas != null ? qtyForDisplay(item.qtd_caixas) : '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.qtd_unitaria != null ? qtyForDisplay(item.qtd_unitaria) : '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.qtd_total != null ? qtyForDisplay(item.qtd_total) : '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.preco_unitario != null ? BRL.format(moneyForDisplay(item.preco_unitario)) : '—'}</td>
                    <td className='px-4 py-2 text-right'>{item.valor_com_desconto != null ? BRL.format(moneyForDisplay(item.valor_com_desconto)) : '—'}</td>
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
      )}


      {notas.length > 0 && (
        <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6'>
          <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'>Notas fiscais</h2>
          <p className='text-xs text-slate-600 mb-4'>Notas registradas no faturamento deste pedido.</p>

          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm mb-4'>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Total faturado</p>
              <p className='text-slate-800'>{BRL.format(moneyForDisplay(order.total_faturado ?? '0'))}</p>
            </div>
            <div>
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Divergência</p>
              <p className={divergencia === 0 ? 'text-slate-800' : divergencia > 0 ? 'text-slate-800 font-semibold' : 'text-red-600 font-medium'}>
                {BRL.format(divergencia)}
              </p>
            </div>
          </div>

          <div className='overflow-x-auto rounded-lg border'>
            <table className='min-w-[640px] w-full text-sm'>
              <thead>
                <tr className='border-b bg-primary text-white'>
                  <th className='px-4 py-2 text-left font-semibold'>Número</th>
                  <th className='px-4 py-2 text-left font-semibold'>Série</th>
                  <th className='px-4 py-2 text-left font-semibold'>Emissão</th>
                  <th className='px-4 py-2 text-right font-semibold'>Valor</th>
                  <th className='px-4 py-2 text-left font-semibold'>Observação</th>
                </tr>
              </thead>
              <tbody>
                {notas.map((nota) => (
                  <tr key={nota.uuid} className='border-b last:border-0'>
                    <td className='px-4 py-2 font-mono'>{nota.numero_nota}</td>
                    <td className='px-4 py-2'>{nota.serie ?? '—'}</td>
                    <td className='px-4 py-2'>{formatDate(nota.data_emissao)}</td>
                    <td className='px-4 py-2 text-right font-medium'>{BRL.format(moneyForDisplay(nota.valor))}</td>
                    <td className='px-4 py-2 max-w-xs truncate'>{nota.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
