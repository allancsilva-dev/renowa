import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Pencil, Plus, Trash2, Upload, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import ImportCsvDialog from '@/components/ImportCsvDialog';
import { CSV_TEMPLATE_HEADERS } from '@/lib/csvTemplate';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchSuppliers, deleteSupplier } from '@/services/suppliers.service';
import { importSuppliers } from '@/services/import';
import { getApiErrorMessage } from '@/lib/errors';
import type { Supplier } from '@/types';
import { Can } from '@/components/Can';
import { RowAction, RowActions } from '@/components/tables/RowActions';
import DetailDialog from '@/components/ui/DetailDialog';

export default function Fornecedores() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [viewing, setViewing] = useState<Supplier | null>(null);

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
        <RowActions>
          <RowAction icon={Eye} label={`Ver ${row.razao_social}`} onClick={() => setViewing(row)} />
          <Can permission='fornecedores.editar'>
            <RowAction
              icon={Pencil}
              label={`Editar ${row.razao_social}`}
              onClick={() => navigate(`/fornecedores/${row.uuid}/editar`)}
            />
          </Can>
          <Can permission='fornecedores.deletar'>
            <RowAction
              icon={Trash2}
              danger
              label={`Remover ${row.razao_social}`}
              disabled={deletingUuid === row.uuid}
              onClick={() => handleDelete(row)}
            />
          </Can>
        </RowActions>
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

        <div className='flex items-center gap-2'>
          <Can permission='fornecedores.criar'>
            <button
              onClick={() => setIsImportOpen(true)}
              className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
            >
              <Upload className='h-4 w-4' />
              Importar
            </button>
          </Can>
          <Can permission='fornecedores.criar'>
            <button
              onClick={() => navigate('/fornecedores/novo')}
              className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
            >
              <Plus className='h-4 w-4' />
              Novo Fornecedor
            </button>
          </Can>
        </div>
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

      {viewing && (
        <DetailDialog
          title='Fornecedor'
          onClose={() => setViewing(null)}
          fields={[
            { label: 'Razão Social', value: viewing.razao_social },
            { label: 'CNPJ', value: viewing.cnpj },
            { label: 'Inscrição Estadual', value: viewing.inscricao_estadual },
            { label: 'Telefone', value: viewing.telefone },
            { label: 'Endereço', value: viewing.endereco },
            { label: 'Número', value: viewing.numero },
            { label: 'Complemento', value: viewing.complemento },
            { label: 'Bairro', value: viewing.bairro },
            { label: 'Cidade / UF', value: viewing.cidade ? `${viewing.cidade}${viewing.uf ? ` / ${viewing.uf}` : ''}` : null },
            { label: 'CEP', value: viewing.cep },
          ]}
          footer={
            <Can permission='fornecedores.editar'>
              <button
                type='button'
                onClick={() => navigate(`/fornecedores/${viewing.uuid}/editar`)}
                className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
              >
                Editar
              </button>
            </Can>
          }
        />
      )}

      {isImportOpen && (
        <ImportCsvDialog
          title='Importar fornecedores'
          template={{ filename: 'modelo-fornecedores.csv', header: CSV_TEMPLATE_HEADERS.fornecedores }}
          importFn={importSuppliers}
          onImported={reload}
          onClose={() => setIsImportOpen(false)}
          help={
            <>
              O arquivo precisa ter uma linha de cabeçalho com{' '}
              <code className='rounded bg-slate-100 px-1'>razao_social</code> (obrigatório) e, opcionalmente,{' '}
              <code className='rounded bg-slate-100 px-1'>cnpj</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>endereco</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>numero</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>complemento</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>bairro</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>cidade</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>uf</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>cep</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>telefone</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>inscricao_estadual</code>. Registros com o mesmo CNPJ são atualizados.
            </>
          }
        />
      )}
    </div>
  );
}
