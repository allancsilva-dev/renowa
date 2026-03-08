import { useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchClients } from '@/services/clients.service';
import type { Client } from '@/types';

export default function Clientes() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchClients({ ...params, search: debouncedSearch }),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Client>({ fetcher });

  const columns = [
    {
      key: 'razao_social',
      header: 'Razão Social',
      cell: (row: Client) => (
        <p className='font-medium text-slate-900'>{row.razao_social}</p>
      ),
    },
    {
      key: 'cnpj',
      header: 'CNPJ',
      cell: (row: Client) => row.cnpj ?? '—',
    },
    {
      key: 'tel',
      header: 'Telefone',
      cell: (row: Client) => row.tel ?? '—',
    },
    {
      key: 'email',
      header: 'E-mail',
      cell: (row: Client) => row.email ?? '—',
    },
    {
      key: 'cidade',
      header: 'Cidade / UF',
      cell: (row: Client) =>
        row.cidade ? `${row.cidade}${row.uf ? ` / ${row.uf}` : ''}` : '—',
    },
  ];

  return (
    <div className='space-y-4'>
      {/* Toolbar */}
      <div className='flex items-center justify-between gap-4'>
        <div className='relative flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
          <input
            type='text'
            placeholder='Buscar cliente...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full rounded-lg border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          />
        </div>

        <button className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'>
          <Plus className='h-4 w-4' />
          Novo Cliente
        </button>
      </div>

      {/* Conteúdo */}
      {error ? (
        <ErrorState onRetry={reload} />
      ) : data.length === 0 && !isLoading ? (
        <EmptyState
          title='Nenhum cliente cadastrado'
          description='Clique em "Novo Cliente" para começar.'
        />
      ) : (
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          meta={meta ?? undefined}
          onPageChange={goToPage}
        />
      )}
    </div>
  );
}
