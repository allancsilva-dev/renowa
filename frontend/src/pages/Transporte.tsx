import { useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import api from '@/lib/apiClient';
import Dialog from '@/components/ui/Dialog';
import { withGeneratedUuid } from '@/lib/entityPayload';
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
      await api.post('/transportadoras', withGeneratedUuid({
        razao_social: form.razao_social,
        cnpj: form.cnpj || null,
        telefone: form.telefone || null,
        endereco_completo: form.endereco_completo || null,
      }));
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
          className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
        >
          <Plus className='h-4 w-4' />
          Nova Transportadora
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
        emptyTitle='Nenhuma transportadora cadastrada'
      />

      {/* Modal */}
      {isOpen && (
        <Dialog open title='Nova Transportadora' onClose={() => setIsOpen(false)} className='max-w-md'>
            <form onSubmit={handleSubmit} className='space-y-4'>
              {formError && (
                <div role='alert' className='rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>
                  {formError}
                </div>
              )}

              <div className='flex flex-col gap-1'>
                <label htmlFor='transportadora-razao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Razão Social <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  id='transportadora-razao'
                  name='razao_social'
                  value={form.razao_social}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='transportadora-cnpj' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CNPJ</label>
                <input
                  type='text'
                  id='transportadora-cnpj'
                  name='cnpj'
                  value={form.cnpj}
                  onChange={handleChange}
                  placeholder='00.000.000/0001-00'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='transportadora-telefone' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Telefone</label>
                <input
                  type='text'
                  id='transportadora-telefone'
                  name='telefone'
                  value={form.telefone}
                  onChange={handleChange}
                  placeholder='(00) 00000-0000'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='transportadora-endereco' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Endereço</label>
                <input
                  type='text'
                  id='transportadora-endereco'
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
                  className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 disabled:opacity-60 transition-colors'
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
        </Dialog>
      )}
    </div>
  );
}
