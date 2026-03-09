import { useState, useCallback } from 'react';
import { Plus, X } from 'lucide-react';
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

interface NovaTransportadoraForm {
  razao_social: string;
  cnpj: string;
  telefone: string;
  endereco_completo: string;
}

const emptyForm: NovaTransportadoraForm = {
  razao_social: '',
  cnpj: '',
  telefone: '',
  endereco_completo: '',
};

function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskTel(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d)/, '($1) $2-$3').replace(/^(\d{2})(\d)/, '($1) $2');
  return d.replace(/^(\d{2})(\d{5})(\d)/, '($1) $2-$3');
}

const inputClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A9D8F] focus:ring-1 focus:ring-[#2A9D8F]/40 w-full';

export default function Transporte() {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<NovaTransportadoraForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name === 'cnpj') {
      setForm((prev) => ({ ...prev, cnpj: maskCnpj(value) }));
    } else if (name === 'telefone') {
      setForm((prev) => ({ ...prev, telefone: maskTel(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      setFormError('Razão Social é obrigatória.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api.post('/transportadoras', {
        razao_social: form.razao_social,
        cnpj: form.cnpj || null,
        telefone: form.telefone || null,
        endereco_completo: form.endereco_completo || null,
      });
      setIsOpen(false);
      setForm(emptyForm);
      reload();
    } catch {
      setFormError('Erro ao salvar transportadora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <button
          onClick={() => { setIsOpen(true); setForm(emptyForm); setFormError(null); }}
          className='flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity'
          style={{ backgroundColor: '#2A9D8F' }}
        >
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

      {/* Modal */}
      {isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center'>
          {/* Overlay */}
          <div
            className='absolute inset-0 bg-black/40'
            onClick={() => setIsOpen(false)}
          />

          {/* Dialog */}
          <div className='relative z-10 w-full max-w-md rounded-xl bg-white shadow-xl p-6'>
            <div className='flex items-center justify-between mb-5'>
              <h2 className='text-base font-bold text-slate-900'>Nova Transportadora</h2>
              <button
                onClick={() => setIsOpen(false)}
                className='rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors'
              >
                <X className='h-5 w-5' />
              </button>
            </div>

            <form onSubmit={handleSubmit} className='space-y-4'>
              {formError && (
                <div className='rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600'>
                  {formError}
                </div>
              )}

              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Razão Social <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  name='razao_social'
                  value={form.razao_social}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CNPJ</label>
                <input
                  type='text'
                  name='cnpj'
                  value={form.cnpj}
                  onChange={handleChange}
                  placeholder='00.000.000/0001-00'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Telefone</label>
                <input
                  type='text'
                  name='telefone'
                  value={form.telefone}
                  onChange={handleChange}
                  placeholder='(00) 00000-0000'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Endereço</label>
                <input
                  type='text'
                  name='endereco_completo'
                  value={form.endereco_completo}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              <div className='flex justify-end gap-3 pt-2'>
                <button
                  type='button'
                  onClick={() => setIsOpen(false)}
                  className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
                >
                  Cancelar
                </button>
                <button
                  type='submit'
                  disabled={saving}
                  className='rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 transition-opacity'
                  style={{ backgroundColor: '#2A9D8F' }}
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
