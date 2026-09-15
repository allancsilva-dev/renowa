import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, LockKeyhole, RotateCcw } from 'lucide-react';
import LoadingState from '@/components/feedback/LoadingState';
import ErrorState from '@/components/feedback/ErrorState';
import Dialog from '@/components/ui/Dialog';
import { InputMoney } from '@/components/ui/InputMoney';
import { useAuth } from '@/hooks/useAuth';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import {
  fetchFaturamentoPedidoDetalhe, atualizarNota, excluirNota,
  finalizarFaturamento, reabrirFaturamento,
  type FaturamentoPedidoDetalhe as PedidoDetalhe, type NotaFiscal,
} from '@/services/faturamento.service';
import { moneyForDisplay } from '@/lib/decimal';
import { formatDate } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import { orderStatusLabel, orderStatusColor, type OrderStatus } from '@/types';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type NotaForm = { numero_nota: string; serie: string; valor: number | null; data_emissao: string; observacao: string };

function notaToForm(n: NotaFiscal): NotaForm {
  return {
    numero_nota: n.numero_nota,
    serie: n.serie ?? '',
    valor: Number(n.valor),
    data_emissao: n.data_emissao ?? '',
    observacao: n.observacao ?? '',
  };
}

export default function FaturamentoDetalhe() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('faturamento.editar');
  const { uuid: finalizacaoUuid, renovar: renovarFinalizacaoUuid } = useUuidDeCriacao();

  const [pedido, setPedido] = useState<PedidoDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingNota, setEditingNota] = useState<NotaFiscal | null>(null);
  const [editForm, setEditForm] = useState<NotaForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [closingAction, setClosingAction] = useState<'finalizar' | 'reabrir' | null>(null);
  const [motivo, setMotivo] = useState('');

  const load = useCallback(() => {
    if (!uuid) return;
    setLoading(true);
    setError(null);
    fetchFaturamentoPedidoDetalhe(uuid)
      .then(setPedido)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [uuid]);

  useEffect(() => { load(); }, [load]);

  function openEdit(nota: NotaFiscal) {
    setEditingNota(nota);
    setEditForm(notaToForm(nota));
    setFormError(null);
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingNota || !editForm) return;
    if (!editForm.numero_nota.trim() || editForm.valor === null) {
      setFormError('Informe o número da nota e o valor.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await atualizarNota(editingNota.uuid, {
        version: editingNota.version,
        numero_nota: editForm.numero_nota.trim(),
        serie: editForm.serie.trim() || null,
        valor: editForm.valor,
        data_emissao: editForm.data_emissao || null,
        observacao: editForm.observacao.trim() || null,
      });
      setEditingNota(null);
      load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(nota: NotaFiscal) {
    if (deletingUuid) return;
    if (!window.confirm(`Excluir a nota fiscal ${nota.numero_nota}?`)) return;
    setDeletingUuid(nota.uuid);
    setRowActionError(null);
    try {
      await excluirNota(nota.uuid, nota.version);
      load();
    } catch (err) {
      setRowActionError(getApiErrorMessage(err));
    } finally {
      setDeletingUuid(null);
    }
  }

  async function handleClosingSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!uuid || !pedido || motivo.trim().length < 3) {
      setFormError('Informe um motivo com pelo menos 3 caracteres.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (closingAction === 'finalizar') {
        await finalizarFaturamento(uuid, { uuid: finalizacaoUuid, version: pedido.version, motivo: motivo.trim() });
      } else if (closingAction === 'reabrir' && pedido.finalizacao_ativa) {
        await reabrirFaturamento(uuid, {
          version: pedido.version,
          finalizacao_version: pedido.finalizacao_ativa.version,
          motivo: motivo.trim(),
        });
      }
      setClosingAction(null);
      setMotivo('');
      load();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error || !pedido) {
    return <ErrorState title='Não foi possível carregar o faturamento do pedido' description={error ?? undefined} onRetry={load} />;
  }

  const status = pedido.status as OrderStatus;
  const divergenciaValue = moneyForDisplay(pedido.divergencia);

  return (
    <div className='max-w-4xl mx-auto space-y-4'>
      <button
        type='button'
        onClick={() => navigate('/faturamento')}
        className='flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900'
      >
        <ArrowLeft className='h-4 w-4' />
        Voltar para Faturamento
      </button>

      <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6 space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold text-slate-900'>
              {pedido.numero_pedido != null ? `Pedido #${pedido.numero_pedido}` : 'Pedido'}
            </h1>
            <p className='text-sm text-slate-500 mt-1'>
              {pedido.cliente?.razao_social ?? 'Sem cliente'} · {pedido.fornecedor?.razao_social ?? 'Sem fornecedor'}
            </p>
          </div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${orderStatusColor[status] ?? 'bg-slate-100 text-slate-600'}`}>
            {orderStatusLabel[status] ?? pedido.status}
          </span>
        </div>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-3 text-sm'>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Valor do pedido</p>
            <p className='text-slate-800'>{BRL.format(moneyForDisplay(pedido.valor))}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Total faturado</p>
            <p className='text-slate-800'>{BRL.format(moneyForDisplay(pedido.total_faturado))}</p>
          </div>
          <div>
            <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{pedido.finalizacao_ativa ? 'Saldo encerrado' : 'Divergência'}</p>
            <p className={divergenciaValue === 0 ? 'text-slate-800' : divergenciaValue > 0 ? 'text-slate-800 font-semibold' : 'text-red-600 font-medium'}>
              {BRL.format(divergenciaValue)}
            </p>
          </div>
        </div>
      </div>

      <section className='rounded-lg border border-slate-200 bg-white p-6 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h2 className='text-base font-semibold text-slate-900'>Fechamento do saldo</h2>
            {pedido.finalizacao_ativa ? (
              <p className='mt-1 text-sm text-slate-600'>
                Saldo encerrado de <strong>{BRL.format(moneyForDisplay(pedido.finalizacao_ativa.saldo_encerrado))}</strong> por {pedido.finalizacao_ativa.finalizadoPor?.nome ?? 'usuário identificado'}.
              </p>
            ) : pedido.status === 'parcialmente_faturado' ? (
              <p className='mt-1 text-sm text-slate-600'>Finalize manualmente somente quando a divergência não será coberta por outra nota.</p>
            ) : (
              <p className='mt-1 text-sm text-slate-600'>Não há saldo para finalizar manualmente.</p>
            )}
          </div>
          {canEdit && pedido.status === 'parcialmente_faturado' && divergenciaValue > 0 && !pedido.finalizacao_ativa && (
            <button type='button' onClick={() => { renovarFinalizacaoUuid(); setMotivo(''); setClosingAction('finalizar'); setFormError(null); }} className='inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800'>
              <LockKeyhole className='h-4 w-4' /> Finalizar
            </button>
          )}
          {canEdit && pedido.finalizacao_ativa && (
            <button type='button' onClick={() => { setClosingAction('reabrir'); setFormError(null); }} className='inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50'>
              <RotateCcw className='h-4 w-4' /> Reabrir faturamento
            </button>
          )}
        </div>
        {pedido.finalizacao_ativa && <p className='mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700'><strong>Motivo:</strong> {pedido.finalizacao_ativa.motivo}</p>}
        {pedido.finalizacoes.length > 0 && (
          <details className='mt-4 text-sm'>
            <summary className='cursor-pointer font-medium text-slate-700'>Histórico de fechamentos ({pedido.finalizacoes.length})</summary>
            <ul className='mt-2 space-y-2'>
              {pedido.finalizacoes.map((item) => <li key={item.uuid} className='rounded-lg border border-slate-200 p-3 text-slate-700'>
                {formatDate(item.created_at.slice(0, 10))} · {BRL.format(moneyForDisplay(item.saldo_encerrado))} · {item.motivo}
                {item.reaberto_at && <span className='block text-slate-600'>Reaberto: {item.reabertura_motivo} ({item.reabertoPor?.nome ?? 'usuário identificado'})</span>}
              </li>)}
            </ul>
          </details>
        )}
      </section>

      <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6'>
        <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'>Notas fiscais</h2>
        <p className='text-xs text-slate-600 mb-4'>Histórico de notas registradas para este pedido.</p>

        {rowActionError && (
          <div role='alert' className='mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
            {rowActionError}
          </div>
        )}

        {pedido.notas.length === 0 ? (
          <p className='text-sm text-slate-500'>Nenhuma nota fiscal registrada ainda.</p>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <table className='min-w-[640px] w-full text-sm'>
              <thead>
                <tr className='border-b bg-primary text-white'>
                  <th className='px-4 py-2 text-left font-semibold'>Número</th>
                  <th className='px-4 py-2 text-left font-semibold'>Série</th>
                  <th className='px-4 py-2 text-left font-semibold'>Emissão</th>
                  <th className='px-4 py-2 text-right font-semibold'>Valor</th>
                  <th className='px-4 py-2 text-left font-semibold'>Observação</th>
                  {canEdit && !pedido.finalizacao_ativa && <th className='px-4 py-2 text-left font-semibold'>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {pedido.notas.map((nota) => (
                  <tr key={nota.uuid} className='border-b last:border-0'>
                    <td className='px-4 py-2 font-mono'>{nota.numero_nota}</td>
                    <td className='px-4 py-2'>{nota.serie ?? '—'}</td>
                    <td className='px-4 py-2'>{formatDate(nota.data_emissao)}</td>
                    <td className='px-4 py-2 text-right font-medium'>{BRL.format(moneyForDisplay(nota.valor))}</td>
                    <td className='px-4 py-2 max-w-xs truncate'>{nota.observacao ?? '—'}</td>
                    {canEdit && !pedido.finalizacao_ativa && (
                      <td className='px-4 py-2'>
                        <div className='flex items-center gap-2'>
                          <button
                            type='button'
                            aria-label={`Editar nota ${nota.numero_nota}`}
                            onClick={() => openEdit(nota)}
                            className='inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100'
                          >
                            <Pencil className='h-4 w-4' />
                          </button>
                          <button
                            type='button'
                            aria-label={`Excluir nota ${nota.numero_nota}`}
                            disabled={deletingUuid === nota.uuid}
                            onClick={() => handleDelete(nota)}
                            className='inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60'
                          >
                            <Trash2 className='h-4 w-4' />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingNota && editForm && (
        <Dialog open title={`Editar nota ${editingNota.numero_nota}`} onClose={() => setEditingNota(null)} className='max-w-md'>
          <form onSubmit={handleEditSubmit} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {formError}
              </div>
            )}
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='edit_numero_nota' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Número da nota <span className='text-red-500'>*</span>
                </label>
                <input
                  id='edit_numero_nota'
                  required
                  value={editForm.numero_nota}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, numero_nota: e.target.value } : p))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='edit_serie' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Série</label>
                <input
                  id='edit_serie'
                  value={editForm.serie}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, serie: e.target.value } : p))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='edit_valor' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Valor <span className='text-red-500'>*</span>
                </label>
                <InputMoney id='edit_valor' value={editForm.valor} onChange={(v) => setEditForm((p) => (p ? { ...p, valor: v } : p))} required />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='edit_data_emissao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Data de emissão</label>
                <input
                  id='edit_data_emissao'
                  type='date'
                  value={editForm.data_emissao}
                  onChange={(e) => setEditForm((p) => (p ? { ...p, data_emissao: e.target.value } : p))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
            </div>
            <div className='flex flex-col gap-1'>
              <label htmlFor='edit_observacao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</label>
              <textarea
                id='edit_observacao'
                rows={3}
                value={editForm.observacao}
                onChange={(e) => setEditForm((p) => (p ? { ...p, observacao: e.target.value } : p))}
                className='resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setEditingNota(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {closingAction && (
        <Dialog open title={closingAction === 'finalizar' ? 'Finalizar saldo restante' : 'Reabrir faturamento'} onClose={() => setClosingAction(null)} className='max-w-md'>
          <form onSubmit={handleClosingSubmit} className='space-y-4'>
            {closingAction === 'finalizar' && <p className='text-sm text-slate-700'>Você encerrará o saldo de <strong>{BRL.format(divergenciaValue)}</strong> sem criar receita ou nota fiscal.</p>}
            {formError && <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>{formError}</div>}
            <label className='flex flex-col gap-1 text-sm font-medium text-slate-700'>Motivo
              <textarea required minLength={3} maxLength={1000} rows={3} value={motivo} onChange={(event) => setMotivo(event.target.value)} className='resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/40' />
            </label>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => setClosingAction(null)} className='rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700'>Cancelar</button>
              <button type='submit' disabled={saving} className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60'>{saving ? 'Salvando...' : closingAction === 'finalizar' ? 'Confirmar finalização' : 'Confirmar reabertura'}</button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
