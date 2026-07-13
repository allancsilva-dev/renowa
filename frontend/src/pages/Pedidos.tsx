import { useState, useCallback, useEffect } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import Dialog from '@/components/ui/Dialog';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { fetchOrders } from '@/services/orders.service';
import { fetchClients } from '@/services/clients.service';
import api from '@/lib/apiClient';
import { withGeneratedUuid } from '@/lib/entityPayload';
import type { Client, Order, OrderStatus } from '@/types';
import { moneyForDisplay } from '@/lib/decimal';

type OrderForm = {
  data: string;
  cliente_uuid: string;
  status: OrderStatus;
  observacao: string;
};

const EMPTY_FORM: OrderForm = {
  data: '',
  cliente_uuid: '',
  status: 'em_aberto',
  observacao: '',
};

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

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40';

export default function Pedidos() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchOrders({ ...params, status: statusFilter || undefined }),
    [statusFilter],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Order>({ fetcher });

  useEffect(() => {
    if (!isOpen || clients.length > 0) return;
    let active = true;
    setClientsLoading(true);
    fetchClients({ page: 1, limit: 100 })
      .then((result) => { if (active) setClients(result.data); })
      .catch(() => { if (active) setFormError('Não foi possível carregar os clientes.'); })
      .finally(() => { if (active) setClientsLoading(false); });
    return () => { active = false; };
  }, [isOpen, clients.length]);

  function openDialog() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsOpen(true);
  }

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/pedidos', withGeneratedUuid({
        data: form.data || null,
        cliente_uuid: form.cliente_uuid || undefined,
        status: form.status,
        observacao: form.observacao.trim() || null,
      }));
      setIsOpen(false);
      setForm(EMPTY_FORM);
      reload();
    } catch {
      setFormError('Erro ao salvar pedido. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const columns = [
    {
      key: 'numero',
      header: 'Nº',
      cell: (row: Order) => (
        <span className='font-mono font-medium'>
          {row.numero_pedido != null ? `#${row.numero_pedido}` : '—'}
        </span>
      ),
      className: 'w-20',
    },
    {
      // Order não carrega join de cliente — exibe o ID até haver endpoint com join
      key: 'cliente_id',
      header: 'Cliente',
      cell: (row: Order) => row.cliente_id != null ? `ID ${row.cliente_id}` : '—',
    },
    {
      key: 'data',
      header: 'Data',
      cell: (row: Order) =>
        row.data ? new Date(row.data).toLocaleDateString('pt-BR') : '—',
    },
    {
      key: 'total',
      header: 'Total s/ Imposto',
      cell: (row: Order) =>
        row.total_sem_imposto != null ? BRL.format(moneyForDisplay(row.total_sem_imposto)) : '—',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: Order) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}>
          {STATUS_LABELS[row.status]}
        </span>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
          className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
        >
          <option value=''>Todos os status</option>
          {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <button
          onClick={openDialog}
          className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
        >
          <Plus className='h-4 w-4' />
          Novo Pedido
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhum pedido encontrado'
      />

      {isOpen && (
        <Dialog open title='Novo Pedido' onClose={() => setIsOpen(false)} className='max-w-lg'>
          <form onSubmit={handleSubmit} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {formError}
              </div>
            )}

            <div className='flex flex-col gap-1'>
              <label htmlFor='pedido-data' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Data</label>
              <input id='pedido-data' name='data' type='date' value={form.data} onChange={handleChange} className={inputClass} />
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='pedido-cliente' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Cliente</label>
              <select
                id='pedido-cliente'
                name='cliente_uuid'
                value={form.cliente_uuid}
                onChange={handleChange}
                disabled={clientsLoading}
                className={inputClass}
              >
                <option value=''>{clientsLoading ? 'Carregando clientes...' : 'Selecione um cliente'}</option>
                {clients.map((client) => (
                  <option key={client.uuid} value={client.uuid}>{client.razao_social}</option>
                ))}
              </select>
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='pedido-status' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Status</label>
              <select id='pedido-status' name='status' value={form.status} onChange={handleChange} className={inputClass}>
                {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((status) => (
                  <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                ))}
              </select>
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='pedido-observacao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</label>
              <textarea
                id='pedido-observacao'
                name='observacao'
                value={form.observacao}
                onChange={handleChange}
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setIsOpen(false)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={saving || clientsLoading} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
