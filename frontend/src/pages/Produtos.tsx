import { useState, useCallback } from 'react';
import { Plus, Search } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import Dialog from '@/components/ui/Dialog';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import api from '@/lib/apiClient';
import { withGeneratedUuid } from '@/lib/entityPayload';
import type { Product, PaginatedResponse } from '@/types';
import { moneyForDisplay } from '@/lib/decimal';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type ProductForm = {
  codigo: string;
  descricao: string;
  preco_base: string;
};

const EMPTY_FORM: ProductForm = { codigo: '', descricao: '', preco_base: '' };

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40';

export default function Produtos() {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search);

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      api.get<PaginatedResponse<Product>>('/produtos', { params: { ...params, search: debouncedSearch } })
        .then((r) => r.data),
    [debouncedSearch],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Product>({ fetcher });

  function openDialog() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setIsOpen(true);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.descricao.trim()) {
      setFormError('Descrição é obrigatória.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/produtos', withGeneratedUuid({
        codigo: form.codigo.trim() || null,
        descricao: form.descricao.trim(),
        preco_base: form.preco_base !== '' ? Number(form.preco_base) : null,
      }));
      setIsOpen(false);
      setForm(EMPTY_FORM);
      reload();
    } catch {
      setFormError('Erro ao salvar produto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

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
      cell: (row: Product) => row.preco_base != null ? BRL.format(moneyForDisplay(row.preco_base)) : '—',
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
        <button
          onClick={openDialog}
          className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
        >
          <Plus className='h-4 w-4' />
          Novo Produto
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
        emptyTitle='Nenhum produto cadastrado'
      />

      {isOpen && (
        <Dialog open title='Novo Produto' onClose={() => setIsOpen(false)} className='max-w-md'>
          <form onSubmit={handleSubmit} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                {formError}
              </div>
            )}

            <div className='flex flex-col gap-1'>
              <label htmlFor='produto-codigo' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Código</label>
              <input id='produto-codigo' name='codigo' value={form.codigo} onChange={handleChange} placeholder='Código do produto' className={inputClass} />
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='produto-descricao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                Descrição <span className='text-red-500'>*</span>
              </label>
              <input id='produto-descricao' name='descricao' value={form.descricao} onChange={handleChange} placeholder='Descrição do produto' required className={inputClass} />
            </div>

            <div className='flex flex-col gap-1'>
              <label htmlFor='produto-preco' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Preço Base (R$)</label>
              <input id='produto-preco' name='preco_base' type='number' value={form.preco_base} onChange={handleChange} placeholder='0.00' min={0} step='0.01' className={inputClass} />
            </div>

            <div className='flex justify-end gap-3 pt-2'>
              <button type='button' onClick={() => setIsOpen(false)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
                Cancelar
              </button>
              <button type='submit' disabled={saving} className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
