import { useState, useCallback } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import ImportCsvDialog from '@/components/ImportCsvDialog';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import api from '@/lib/apiClient';
import Dialog from '@/components/ui/Dialog';
import { withGeneratedUuid } from '@/lib/entityPayload';
import { importTransportadoras } from '@/services/import';
import type { PaginatedResponse, Transport } from '@/types';

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
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);

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
    { key: 'endereco', header: 'Endereço', cell: (row: Transport) => row.endereco_completo ?? '—' },
    { key: 'acoes', header: 'Ações', cell: (row: Transport) => <div className='flex gap-1'>
      <button type='button' aria-label={`Editar ${row.razao_social}`} onClick={() => { setEditingUuid(row.uuid); setForm({ razao_social: row.razao_social, cnpj: row.cnpj ?? '', telefone: row.telefone ?? '', endereco_completo: row.endereco_completo ?? '' }); setFormError(null); setIsOpen(true); }} className='rounded-md p-2 text-slate-600 hover:bg-slate-100'><Pencil className='h-4 w-4' /></button>
      <button type='button' aria-label={`Excluir ${row.razao_social}`} onClick={() => void handleDelete(row)} className='rounded-md p-2 text-slate-600 hover:bg-red-50 hover:text-red-700'><Trash2 className='h-4 w-4' /></button>
    </div> },
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
      const payload = {
        razao_social: form.razao_social,
        cnpj: form.cnpj || null,
        telefone: form.telefone || null,
        endereco_completo: form.endereco_completo || null,
      };
      if (editingUuid) await api.patch(`/transportadoras/${editingUuid}`, payload);
      else await api.post('/transportadoras', withGeneratedUuid(payload));
      setIsOpen(false);
      setForm(emptyForm);
      reload();
    } catch {
      setFormError('Erro ao salvar transportadora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(transport: Transport) {
    if (!window.confirm(`Excluir a transportadora “${transport.razao_social}”?`)) return;
    try { await api.delete(`/transportadoras/${transport.uuid}`); reload(); }
    catch { setFormError('Não foi possível excluir a transportadora.'); }
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-end gap-2'>
        <button
          onClick={() => setIsImportOpen(true)}
          className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
        >
          <Upload className='h-4 w-4' />
          Importar
        </button>
        <button
          onClick={() => { setIsOpen(true); setEditingUuid(null); setForm(emptyForm); setFormError(null); }}
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

      {isImportOpen && (
        <ImportCsvDialog
          title='Importar transportadoras'
          importFn={importTransportadoras}
          onImported={reload}
          onClose={() => setIsImportOpen(false)}
          help={
            <>
              O arquivo precisa ter uma linha de cabeçalho com{' '}
              <code className='rounded bg-slate-100 px-1'>razao_social</code> (obrigatório) e, opcionalmente,{' '}
              <code className='rounded bg-slate-100 px-1'>cnpj</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>telefone</code>,{' '}
              <code className='rounded bg-slate-100 px-1'>endereco_completo</code>. Registros com o mesmo CNPJ são atualizados.
            </>
          }
        />
      )}

      {/* Modal */}
      {isOpen && (
        <Dialog open title={editingUuid ? 'Editar Transportadora' : 'Nova Transportadora'} onClose={() => setIsOpen(false)} className='max-w-md'>
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
