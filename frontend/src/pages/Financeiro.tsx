import { useState, useCallback } from 'react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import api from '@/services/axiosInstance';
import type { FinanceMovement, PaginatedResponse, MovimentacaoTipo } from '@/types';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// Tipos válidos conforme arquitetura — não existe status/vencimento nesta entidade
const TIPO_OPTIONS: MovimentacaoTipo[] = ['Custo Fixo', 'Custo Rotativo', 'Venda'];

const TIPO_COLORS: Record<MovimentacaoTipo, string> = {
  'Venda':          'bg-primary/10 text-primary',
  'Custo Fixo':     'bg-red-100 text-red-700',
  'Custo Rotativo': 'bg-orange-100 text-orange-700',
};

export default function Financeiro() {
  const [tipo, setTipo] = useState<MovimentacaoTipo | ''>('');

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      api.get<PaginatedResponse<FinanceMovement>>('/financeiro/movimentacoes', {
        params: { ...params, tipo: tipo || undefined },
      }).then((r) => r.data),
    [tipo],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<FinanceMovement>({ fetcher });

  const columns = [
    {
      key: 'descricao',
      header: 'Descrição',
      cell: (row: FinanceMovement) => row.descricao ?? '—',
    },
    {
      key: 'tipo',
      header: 'Tipo',
      cell: (row: FinanceMovement) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TIPO_COLORS[row.tipo]}`}>
          {row.tipo}
        </span>
      ),
    },
    {
      key: 'valor',
      header: 'Valor',
      cell: (row: FinanceMovement) => BRL.format(row.valor),
    },
    {
      key: 'data',
      header: 'Data',
      cell: (row: FinanceMovement) => new Date(row.data).toLocaleDateString('pt-BR'),
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
          {TIPO_OPTIONS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
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
