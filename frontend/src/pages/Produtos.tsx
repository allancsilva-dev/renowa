import { useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import api from '@/services/axiosInstance';
import type { Product, PaginatedResponse } from '@/types';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Produtos() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      api.get<PaginatedResponse<Product>>('/produtos', { params: { ...params, search: debouncedSearch } })
        .then((r) => r.data),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Product>({ fetcher });

  const columns = [
    {
      key: 'descricao',
      header: 'Descrição',
      cell: (row: Product) => (
        <div>
          <p className='font-medium text-slate-900'>{row.descricao}</p>
          {row.codigo && <p className='text-xs text-slate-500'>Cód: {row.codigo}</p>}
        </div>
      ),
    },
    {
      key: 'preco_base',
      header: 'Preço Base',
      // preco_base é nullable no modelo de dados
      cell: (row: Product) => row.preco_base != null ? BRL.format(row.preco_base) : '—',
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div className='relative flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
          <input
            type='text'
            placeholder='Buscar produto...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full rounded-lg border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          />
        </div>
        <button className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'>
          <Plus className='h-4 w-4' />
          Novo Produto
        </button>
      </div>

      {error ? (
        <ErrorState onRetry={reload} />
      ) : data.length === 0 && !isLoading ? (
        <EmptyState title='Nenhum produto cadastrado' />
      ) : (
        <DataTable columns={columns} data={data} isLoading={isLoading} meta={meta ?? undefined} onPageChange={goToPage} />
      )}
    </div>
  );
}
