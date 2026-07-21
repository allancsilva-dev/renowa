import { useCallback, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import Dialog from '@/components/ui/Dialog';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { fetchSuppliers } from '@/services/suppliers.service';
import api from '@/lib/apiClient';
import { withGeneratedUuid } from '@/lib/entityPayload';
import { maskCnpj } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type { Supplier } from '@/types';

type SupplierForm = {
  razao_social: string;
  cnpj: string;
};

const EMPTY_FORM: SupplierForm = { razao_social: '', cnpj: '' };

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40';

export default function Fornecedores() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<SupplierForm>(EMPTY_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState<SupplierForm>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      fetchSuppliers({ ...params, search: debouncedSearch || undefined }),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Supplier>({ fetcher });

  function openCreateDialog() {
    setCreateForm(EMPTY_FORM);
    setCreateError(null);
    setIsCreateOpen(true);
  }

  function openEditDialog(supplier: Supplier) {
    setEditingSupplier(supplier);
    setEditForm({ razao_social: supplier.razao_social, cnpj: supplier.cnpj ?? '' });
    setEditError(null);
    setRowActionError(null);
  }

  async function handleCreateSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!createForm.razao_social.trim()) {
      setCreateError('Razão Social é obrigatória.');
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      await api.post('/fornecedores', withGeneratedUuid({
        razao_social: createForm.razao_social.trim(),
        cnpj: createForm.cnpj.trim() || undefined,
      }));
      setIsCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      reload();
    } catch (err) {
      setCreateError(getApiErrorMessage(err));
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleEditSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingSupplier) return;
    if (!editForm.razao_social.trim()) {
      setEditError('Razão Social é obrigatória.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await api.patch(`/fornecedores/${editingSupplier.uuid}`, {
        razao_social: editForm.razao_social.trim(),
        cnpj: editForm.cnpj.trim() || null,
      });
      setEditingSupplier(null);
      reload();
    } catch (err) {
      setEditError(getApiErrorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(supplier: Supplier) {
    if (deletingUuid) return;
    if (!window.confirm(`Remover o fornecedor "${supplier.razao_social}"?`)) return;
    setDeletingUuid(supplier.uuid);
    setRowActionError(null);
    try {
      await api.delete(`/fornecedores/${supplier.uuid}`);
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
      key: 'acoes',
      header: 'Ações',
      cell: (row: Supplier) => (
        <div className='flex items-center gap-2'>
          <button
            type='button'
            onClick={() => openEditDialog(row)}
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
          onClick={openCreateDialog}
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

      {isCreateOpen && (
        <Dialog open title='Novo Fornecedor' onClose={() => setIsCreateOpen(false)} className='max-w-md'>
          <form onSubmit={handleCreateSubmit} className='space-y-4'>
            {createError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {createError}
              </div>
            )}

            <div className='flex flex-col gap-1'>
              <label htmlFor='fornecedor-razao-social' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Razão Social <span className='text-red-500'>*</span>
              </label>
              <input
                id='fornecedor-razao-social'
                value={createForm.razao_social}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, razao_social: e.target.value }))}
                required
                className={inputClass}
              />
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='fornecedor-cnpj' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CNPJ</label>
              <input
                id='fornecedor-cnpj'
                value={createForm.cnpj}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, cnpj: maskCnpj(e.target.value) }))}
                placeholder='00.000.000/0001-00'
                inputMode='numeric'
                className={inputClass}
              />
            </div>

            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setIsCreateOpen(false)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={createSaving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {createSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {editingSupplier && (
        <Dialog open title='Editar Fornecedor' onClose={() => setEditingSupplier(null)} className='max-w-md'>
          <form onSubmit={handleEditSubmit} className='space-y-4'>
            {editError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {editError}
              </div>
            )}

            <div className='flex flex-col gap-1'>
              <label htmlFor='edit-fornecedor-razao-social' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Razão Social <span className='text-red-500'>*</span>
              </label>
              <input
                id='edit-fornecedor-razao-social'
                value={editForm.razao_social}
                onChange={(e) => setEditForm((prev) => ({ ...prev, razao_social: e.target.value }))}
                required
                className={inputClass}
              />
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='edit-fornecedor-cnpj' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CNPJ</label>
              <input
                id='edit-fornecedor-cnpj'
                value={editForm.cnpj}
                onChange={(e) => setEditForm((prev) => ({ ...prev, cnpj: maskCnpj(e.target.value) }))}
                placeholder='00.000.000/0001-00'
                inputMode='numeric'
                className={inputClass}
              />
            </div>

            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setEditingSupplier(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={editSaving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {editSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
