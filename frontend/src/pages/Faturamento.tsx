import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import Dialog from '@/components/ui/Dialog';
import { InputMoney } from '@/components/ui/InputMoney';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useAuth } from '@/hooks/useAuth';
import { fetchFaturamentoPedidos, registrarNota, type FaturamentoPedidoRow } from '@/services/faturamento.service';
import { moneyForDisplay } from '@/lib/decimal';
import { getApiErrorMessage } from '@/lib/errors';
import { orderStatusLabel, orderStatusColor, type OrderStatus } from '@/types';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type NotaForm = { numero_nota: string; serie: string; valor: number | null; data_emissao: string; observacao: string };
const EMPTY_NOTA_FORM: NotaForm = { numero_nota: '', serie: '', valor: null, data_emissao: '', observacao: '' };

export default function Faturamento() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('faturamento.editar');

  const [notaPedido, setNotaPedido] = useState<FaturamentoPedidoRow | null>(null);
  const [notaForm, setNotaForm] = useState<NotaForm>(EMPTY_NOTA_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) => fetchFaturamentoPedidos(params),
    [],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<FaturamentoPedidoRow>({ fetcher });

  function openNotaDialog(row: FaturamentoPedidoRow) {
    setNotaPedido(row);
    setNotaForm(EMPTY_NOTA_FORM);
    setFormError(null);
  }

  async function handleSubmitNota(event: React.FormEvent) {
    event.preventDefault();
    if (!notaPedido) return;
    if (!notaForm.numero_nota.trim() || notaForm.valor === null) {
      setFormError('Informe o número da nota e o valor.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await registrarNota(notaPedido.uuid, {
        uuid: crypto.randomUUID(),
        numero_nota: notaForm.numero_nota.trim(),
        serie: notaForm.serie.trim() || undefined,
        valor: notaForm.valor,
        data_emissao: notaForm.data_emissao || undefined,
        observacao: notaForm.observacao.trim() || undefined,
      });
      setNotaPedido(null);
      reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: 'numero',
      header: 'Nº Pedido',
      cell: (row: FaturamentoPedidoRow) => (
        <span className='font-mono font-medium'>{row.numero_pedido != null ? `#${row.numero_pedido}` : '—'}</span>
      ),
    },
    { key: 'cliente', header: 'Cliente', cell: (row: FaturamentoPedidoRow) => row.cliente ?? '—' },
    { key: 'fornecedor', header: 'Fornecedor', cell: (row: FaturamentoPedidoRow) => row.fornecedor ?? '—' },
    { key: 'valor', header: 'Valor', cell: (row: FaturamentoPedidoRow) => BRL.format(moneyForDisplay(row.valor)) },
    {
      key: 'total_faturado',
      header: 'Total Faturado',
      cell: (row: FaturamentoPedidoRow) => BRL.format(moneyForDisplay(row.total_faturado)),
    },
    {
      key: 'divergencia',
      header: 'Divergência',
      cell: (row: FaturamentoPedidoRow) => {
        const value = moneyForDisplay(row.divergencia);
        return <span className={value === 0 ? 'text-slate-600' : value > 0 ? 'text-slate-800 font-semibold' : 'text-red-600 font-medium'}>{BRL.format(value)}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: FaturamentoPedidoRow) => {
        const status = row.status as OrderStatus;
        return (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusColor[status] ?? 'bg-slate-100 text-slate-600'}`}>
            {orderStatusLabel[status] ?? row.status}
          </span>
        );
      },
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: FaturamentoPedidoRow) => (
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => navigate(`/faturamento/${row.uuid}`)}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            Ver detalhes
          </button>
          {canEdit && (
            <button
              type='button'
              onClick={() => openNotaDialog(row)}
              className='inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
            >
              <FileText className='h-3.5 w-3.5' />
              Registrar nota
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div>
        <h1 className='text-xl font-bold text-slate-900'>Faturamento</h1>
        <p className='text-sm text-slate-500 mt-1'>Pedidos liberados aguardando ou em processo de faturamento.</p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhum pedido para faturar'
        emptyDescription='Pedidos liberados aparecem aqui para registro de notas fiscais.'
      />

      {notaPedido && (
        <Dialog
          open
          title={`Registrar nota — Pedido ${notaPedido.numero_pedido != null ? `#${notaPedido.numero_pedido}` : ''}`}
          onClose={() => setNotaPedido(null)}
          className='max-w-md'
        >
          <form onSubmit={handleSubmitNota} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {formError}
              </div>
            )}
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='numero_nota' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Número da nota <span className='text-red-500'>*</span>
                </label>
                <input
                  id='numero_nota'
                  required
                  value={notaForm.numero_nota}
                  onChange={(e) => setNotaForm((p) => ({ ...p, numero_nota: e.target.value }))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='serie' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Série</label>
                <input
                  id='serie'
                  value={notaForm.serie}
                  onChange={(e) => setNotaForm((p) => ({ ...p, serie: e.target.value }))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='valor' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Valor <span className='text-red-500'>*</span>
                </label>
                <InputMoney id='valor' value={notaForm.valor} onChange={(v) => setNotaForm((p) => ({ ...p, valor: v }))} required />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='data_emissao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Data de emissão</label>
                <input
                  id='data_emissao'
                  type='date'
                  value={notaForm.data_emissao}
                  onChange={(e) => setNotaForm((p) => ({ ...p, data_emissao: e.target.value }))}
                  className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
                />
              </div>
            </div>
            <div className='flex flex-col gap-1'>
              <label htmlFor='observacao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</label>
              <textarea
                id='observacao'
                rows={3}
                value={notaForm.observacao}
                onChange={(e) => setNotaForm((p) => ({ ...p, observacao: e.target.value }))}
                className='resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
              />
            </div>
            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setNotaPedido(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
