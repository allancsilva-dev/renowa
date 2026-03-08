import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { fetchOrders } from '@/services/orders.service';
import type { Order, OrderStatus } from '@/types';

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

export default function Pedidos() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchOrders({ ...params, status: statusFilter || undefined }),
    [statusFilter],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Order>({ fetcher });

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
        row.total_sem_imposto != null ? BRL.format(row.total_sem_imposto) : '—',
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
          onClick={() => navigate('/pedidos/novo')}
          className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'
        >
          <Plus className='h-4 w-4' />
          Novo Pedido
        </button>
      </div>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : data.length === 0 && !isLoading ? (
        <EmptyState title='Nenhum pedido encontrado' />
      ) : (
        <DataTable columns={columns} data={data} isLoading={isLoading} meta={meta ?? undefined} onPageChange={goToPage} />
      )}
    </div>
  );
}
