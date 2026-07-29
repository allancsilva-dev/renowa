import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Pencil } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { fetchSacTicket, updateSacStatus } from '@/services/sac.service';
import {
  sacStatusLabel, sacStatusColor, sacStatusTransitions, type SacStatus, type SacTicket,
} from '@/types';
import { moneyForDisplay, qtyForDisplay } from '@/lib/decimal';
import { getApiErrorMessage } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import LoadingState from '@/components/feedback/LoadingState';
import ErrorState from '@/components/feedback/ErrorState';
import { SacTicketPdf } from '@/components/sac/SacTicketPdf';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function SacDetalhe() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [ticket, setTicket] = useState<SacTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(() => {
    if (!uuid) return;
    setLoading(true);
    setError(null);
    fetchSacTicket(uuid)
      .then(setTicket)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => { load(); }, [load]);

  async function handleStatus(status: SacStatus) {
    if (!ticket || !uuid) return;
    setStatusSaving(true);
    setStatusError(null);
    try {
      await updateSacStatus(uuid, status, ticket.version);
      load();
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
      // Refetch antes de imprimir: o papel tem que refletir o que está gravado,
      // não o que a tela carregou minutos atrás.
      const persisted = await fetchSacTicket(uuid);
      setTicket(persisted);
      const blob = await pdf(<SacTicketPdf ticket={persisted} />).toBlob();
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = url;
      const link = document.createElement('a');
      link.href = url;
      link.download = `sac-renowa-${persisted.numero_chamado}.pdf`;
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
  if (error || !ticket) {
    return <ErrorState title='Não foi possível carregar o chamado' description={error ?? undefined} onRetry={load} />;
  }

  const podeEditar = hasPermission('sac.editar');
  const transicoes = podeEditar ? sacStatusTransitions[ticket.status] : [];
  const editavel = podeEditar && (ticket.status === 'aberto' || ticket.status === 'em_andamento');

  return (
    <div className='mx-auto max-w-4xl space-y-4'>
      <button
        type='button'
        onClick={() => navigate('/sac')}
        className='flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900'
      >
        <ArrowLeft className='h-4 w-4' />
        Voltar para SAC
      </button>

      <div className='space-y-4 rounded-xl border border-slate-100 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold text-slate-900'>Nº Abertura SAC {ticket.numero_chamado}</h1>
            <p className='mt-1 text-sm text-slate-500'>{ticket.cliente?.razao_social ?? 'Sem cliente'}</p>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {editavel && (
              <button type='button' onClick={() => navigate(`/sac/${ticket.uuid}/editar`)} className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'>
                <Pencil className='h-4 w-4' />Editar
              </button>
            )}
            <button type='button' onClick={generatePdf} disabled={pdfLoading} className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60'>
              <FileDown className='h-4 w-4' />{pdfLoading ? 'Gerando...' : 'Gerar papel do chamado'}
            </button>
            {transicoes.map((destino) => (
              <button
                key={destino}
                type='button'
                onClick={() => handleStatus(destino)}
                disabled={statusSaving}
                className='min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60'
              >
                Marcar como {sacStatusLabel[destino].toLowerCase()}
              </button>
            ))}
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${sacStatusColor[ticket.status]}`}>
              {sacStatusLabel[ticket.status]}
            </span>
          </div>
        </div>

        {statusError && (
          <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
            {statusError}
          </div>
        )}

        <div className='grid grid-cols-1 gap-4 text-sm sm:grid-cols-4'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Fornecedor</p>
            <p className='text-slate-800'>{ticket.fornecedor?.razao_social ?? '—'}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Número de NFE</p>
            <p className='font-mono text-slate-800'>{ticket.numero_nfe ?? '—'}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Data</p>
            <p className='text-slate-800'>{formatDate(ticket.data)}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Total</p>
            <p className='text-slate-800'>{ticket.total != null ? BRL.format(moneyForDisplay(ticket.total)) : '—'}</p>
          </div>
        </div>

        {ticket.observacao && (
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</p>
            <p className='whitespace-pre-wrap text-sm text-slate-800'>{ticket.observacao}</p>
          </div>
        )}
      </div>

      <div className='rounded-xl border border-slate-100 bg-white p-6 shadow-sm'>
        <h2 className='mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400'>Itens do chamado</h2>
        <div className='overflow-x-auto rounded-lg border'>
          <table className='w-full min-w-[640px] text-sm'>
            <thead>
              <tr className='border-b bg-primary text-white'>
                <th className='px-4 py-2 text-left font-semibold'>COD</th>
                <th className='px-4 py-2 text-right font-semibold'>QUANT</th>
                <th className='px-4 py-2 text-left font-semibold'>MOTIVO</th>
                <th className='px-4 py-2 text-right font-semibold'>VL UNI. (NF)</th>
                <th className='px-4 py-2 text-right font-semibold'>VL. TOTAL NF</th>
              </tr>
            </thead>
            <tbody>
              {ticket.itens.map((item) => (
                <tr key={item.uuid} className='border-b last:border-0'>
                  <td className='px-4 py-2 font-mono'>{item.codigo}</td>
                  <td className='px-4 py-2 text-right'>{qtyForDisplay(item.quantidade)}</td>
                  <td className='px-4 py-2'>{item.motivo}</td>
                  <td className='px-4 py-2 text-right'>{BRL.format(moneyForDisplay(item.valor_unitario))}</td>
                  <td className='px-4 py-2 text-right font-medium'>{BRL.format(moneyForDisplay(item.valor_total))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className='border-t bg-slate-50 font-semibold'>
                <td className='px-4 py-2' colSpan={4}>TOTAL</td>
                <td className='px-4 py-2 text-right'>{ticket.total != null ? BRL.format(moneyForDisplay(ticket.total)) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
