import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { fetchOrders } from '@/services/orders.service';
import { orderStatusLabel, orderStatusColor, type Order, type OrderStatus } from '@/types';
import { moneyForDisplay } from '@/lib/decimal';
import { formatDate } from '@/lib/format';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Pedidos() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [search, setSearch] = useState('');

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchOrders({ ...params, status: statusFilter || undefined, search: search || undefined }),
    [statusFilter, search],
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
      key: 'cliente_id',
      header: 'Cliente',
      cell: (row: Order) => row.cliente?.razao_social ?? '—',
    },
    {
      key: 'data',
      header: 'Data',
      cell: (row: Order) => formatDate(row.data),
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
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusColor[row.status]}`}>
          {orderStatusLabel[row.status]}
        </span>
      ),
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: Order) => (
        <button
          type='button'
          onClick={() => navigate(`/pedidos/${row.uuid}`)}
          className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
        >
          Ver detalhes
        </button>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <input
          type='search'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Cliente, CNPJ ou número'
          aria-label='Buscar pedidos'
          className='min-h-11 min-w-64 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
          className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
        >
          <option value=''>Todos os status</option>
          {(Object.keys(orderStatusLabel) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{orderStatusLabel[s]}</option>
          ))}
        </select>

        <button
          onClick={() => navigate('/pedidos/novo')}
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
        emptyDescription='Clique em "Novo Pedido" para começar.'
      />
    </div>
  );
}
