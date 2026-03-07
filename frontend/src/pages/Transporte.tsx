import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import EmptyState from '@/components/feedback/EmptyState';
import ErrorState from '@/components/feedback/ErrorState';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import api from '@/services/axiosInstance';
import type { PaginatedResponse } from '@/types';

interface Transport {
  uuid: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  is_active: boolean;
}

export default function Transporte() {
  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      api.get<PaginatedResponse<Transport>>('/transportadoras', { params }).then((r) => r.data),
    [],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Transport>({ fetcher });

  const columns = [
    { key: 'razao_social', header: 'Razão Social', cell: (row: Transport) => row.razao_social },
    { key: 'cnpj', header: 'CNPJ', cell: (row: Transport) => row.cnpj ?? '—' },
    { key: 'telefone', header: 'Telefone', cell: (row: Transport) => row.telefone ?? '—' },
    { key: 'email', header: 'E-mail', cell: (row: Transport) => row.email ?? '—' },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <button className='flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'>
          <Plus className='h-4 w-4' />
          Nova Transportadora
        </button>
      </div>
      {error ? (
        <ErrorState onRetry={reload} />
      ) : data.length === 0 && !isLoading ? (
        <EmptyState title='Nenhuma transportadora cadastrada' />
      ) : (
        <DataTable columns={columns} data={data} isLoading={isLoading} meta={meta ?? undefined} onPageChange={goToPage} />
      )}
    </div>
  );
}
