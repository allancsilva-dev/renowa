import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchSuppliers, deleteSupplier } from '@/services/suppliers.service';
import { getApiErrorMessage } from '@/lib/errors';
import type { Supplier } from '@/types';

export default function Fornecedores() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchSuppliers({ ...params, search: debouncedSearch || undefined }),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Supplier>({ fetcher });

  async function handleDelete(supplier: Supplier) {
    if (deletingUuid) return;
    if (!window.confirm(`Remover o fornecedor "${supplier.razao_social}"?`)) return;
    setDeletingUuid(supplier.uuid);
    setRowActionError(null);
    try {
      await deleteSupplier(supplier.uuid);
      reload();
    } catch (err) {
      setRowActionError(getApiErrorMessage(err));
    } finally {
      setDeletingUuid(null);
    }
  }

  const columns = [
    {
      key: 'razao_social',
      header: 'Razão Social',
      cell: (row: Supplier) => <p className='font-medium text-slate-900'>{row.razao_social}</p>,
    },
    {
      key: 'cnpj',
      header: 'CNPJ',
      cell: (row: Supplier) => row.cnpj ?? '—',
    },
    {
      key: 'cidade',
      header: 'Cidade/UF',
      cell: (row: Supplier) => (row.cidade ? `${row.cidade}${row.uf ? `/${row.uf}` : ''}` : '—'),
    },
    {
      key: 'telefone',
      header: 'Telefone',
      cell: (row: Supplier) => row.telefone ?? '—',
    },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: Supplier) => (
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => navigate(`/fornecedores/${row.uuid}/editar`)}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
          >
            Editar
          </button>
          <button
            type='button'
            disabled={deletingUuid === row.uuid}
            onClick={() => handleDelete(row)}
            className='rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60'
          >
            {deletingUuid === row.uuid ? 'Removendo...' : 'Remover'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-4'>
        <div className='relative flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
          <input
            type='text'
            placeholder='Buscar fornecedor...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full rounded-lg border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          />
        </div>

        <button
          onClick={() => navigate('/fornecedores/novo')}
          className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
        >
          <Plus className='h-4 w-4' />
          Novo Fornecedor
        </button>
      </div>

      {rowActionError && (
        <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
          {rowActionError}
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle='Nenhum fornecedor cadastrado'
        emptyDescription='Clique em "Novo Fornecedor" para começar.'
      />
    </div>
  );
}
