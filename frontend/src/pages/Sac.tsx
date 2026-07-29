import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { fetchSacTickets } from '@/services/sac.service';
import { sacStatusLabel, sacStatusColor, type SacTicket, type SacStatus } from '@/types';
import { moneyForDisplay } from '@/lib/decimal';
import { formatDate } from '@/lib/format';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Sac() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<SacStatus | ''>('');
  const [search, setSearch] = useState('');

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchSacTickets({ ...params, status: statusFilter || undefined, search: search || undefined }),
    [statusFilter, search],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<SacTicket>({ fetcher });

  const columns = [
    {
      key: 'numero',
      header: 'Nº',
      cell: (row: SacTicket) => <span className='font-mono font-medium'>#{row.numero_chamado}</span>,
      className: 'w-20',
    },
    { key: 'cliente', header: 'Cliente', cell: (row: SacTicket) => row.cliente?.razao_social ?? '—' },
    { key: 'fornecedor', header: 'Fornecedor', cell: (row: SacTicket) => row.fornecedor?.razao_social ?? '—' },
    { key: 'nfe', header: 'NFE', cell: (row: SacTicket) => row.numero_nfe ?? '—' },
    { key: 'data', header: 'Data', cell: (row: SacTicket) => formatDate(row.data) },
    {
      key: 'total',
      header: 'Total',
      cell: (row: SacTicket) => (row.total != null ? BRL.format(moneyForDisplay(row.total)) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: SacTicket) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${sacStatusColor[row.status]}`}>
          {sacStatusLabel[row.status]}
        </span>
      ),
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: SacTicket) => (
        <button
          type='button'
          onClick={() => navigate(`/sac/${row.uuid}`)}
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
        <div className='flex flex-wrap items-center gap-3'>
          <input
            type='search'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Cliente, CNPJ, nº do chamado ou NFE'
            aria-label='Buscar chamados'
            className='min-h-11 min-w-64 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SacStatus | '')}
            aria-label='Filtrar por status'
            className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          >
            <option value=''>Todos os status</option>
            {(Object.keys(sacStatusLabel) as SacStatus[]).map((s) => (
              <option key={s} value={s}>{sacStatusLabel[s]}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => navigate('/sac/novo')}
          className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800'
        >
          <Plus className='h-4 w-4' />
          Abrir chamado
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
        emptyTitle='Nenhum chamado encontrado'
        emptyDescription='Clique em "Abrir chamado" para começar.'
      />
    </div>
  );
}
