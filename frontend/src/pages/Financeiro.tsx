import { useState, useCallback } from 'react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import api from '@/services/axiosInstance';
import type { FinanceMovement, PaginatedResponse, MovimentacaoStatus, MovimentacaoTipo } from '@/types';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_COLORS: Record<MovimentacaoStatus, string> = {
  PENDENTE:   'bg-yellow-100 text-yellow-700',
  PAGO:       'bg-green-100 text-green-700',
  CANCELADO:  'bg-slate-100 text-slate-600',
  ATRASADO:   'bg-red-100 text-red-700',
};

export default function Financeiro() {
  const [tipo, setTipo] = useState<MovimentacaoTipo | ''>('');
  const [status, setStatus] = useState<MovimentacaoStatus | ''>('');

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      api.get<PaginatedResponse<FinanceMovement>>('/financeiro/movimentacoes', {
        params: { ...params, tipo: tipo || undefined, status: status || undefined },
      }).then((r) => r.data),
    [tipo, status],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<FinanceMovement>({ fetcher });

  const columns = [
    { key: 'descricao', header: 'Descrição', cell: (row: FinanceMovement) => row.descricao },
    {
      key: 'tipo',
      header: 'Tipo',
      cell: (row: FinanceMovement) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.tipo === 'RECEITA' ? 'bg-primary/10 text-primary' : 'bg-red-100 text-red-700'}`}>
          {row.tipo}
        </span>
      ),
    },
    { key: 'valor', header: 'Valor', cell: (row: FinanceMovement) => BRL.format(row.valor) },
    {
      key: 'vencimento',
      header: 'Vencimento',
      cell: (row: FinanceMovement) => new Date(row.data_vencimento).toLocaleDateString('pt-BR'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: FinanceMovement) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status]}`}>
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-3'>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as MovimentacaoTipo | '')}
          className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
        >
          <option value=''>Todos os tipos</option>
          <option value='RECEITA'>Receita</option>
          <option value='DESPESA'>Despesa</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MovimentacaoStatus | '')}
          className='rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40'
        >
          <option value=''>Todos os status</option>
          <option value='PENDENTE'>Pendente</option>
          <option value='PAGO'>Pago</option>
          <option value='ATRASADO'>Atrasado</option>
          <option value='CANCELADO'>Cancelado</option>
        </select>
      </div>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : data.length === 0 && !isLoading ? (
        <EmptyState title='Nenhuma movimentação encontrada' />
      ) : (
        <DataTable columns={columns} data={data} isLoading={isLoading} meta={meta ?? undefined} onPageChange={goToPage} />
      )}
    </div>
  );
}
