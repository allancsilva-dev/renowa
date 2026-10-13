import { useCallback, useState } from 'react';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import { RowMenu, type RowMenuItem } from '@/components/tables/RowMenu';
import Dialog from '@/components/ui/Dialog';
import DetailDialog from '@/components/ui/DetailDialog';
import { Can } from '@/components/Can';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/hooks/useAuth';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { createPreposto, deletePreposto, fetchPrepostos, updatePreposto } from '@/services/prepostos.service';
import { maskCpfCnpj, maskTel } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import type { Preposto } from '@/types';

interface PrepostoForm {
  nome: string;
  documento: string;
  telefone: string;
  email: string;
  endereco_completo: string;
  percentual_comissao: string;
}

const emptyForm: PrepostoForm = {
  nome: '', documento: '', telefone: '', email: '', endereco_completo: '', percentual_comissao: '0',
};

const inputClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A9D8F] focus:ring-1 focus:ring-[#2A9D8F]/40 w-full';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

function formatPercent(value: string | number): string {
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

/** Aba "Cadastro" de Prepostos: mesmo desenho do cadastro de Transporte. */
export default function PrepostosCadastro() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim());
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<PrepostoForm>(emptyForm);
  const [editing, setEditing] = useState<Preposto | null>(null);
  const [viewing, setViewing] = useState<Preposto | null>(null);
  const [deleting, setDeleting] = useState<Preposto | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const { uuid: uuidDeCriacao, renovar: renovarUuidDeCriacao } = useUuidDeCriacao();

  const fetcher = useCallback(
    (params: { page: number; limit: number }) => fetchPrepostos({ ...params, search: debouncedSearch || undefined }),
    [debouncedSearch],
  );
  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Preposto>({ fetcher });

  function openNew() {
    renovarUuidDeCriacao();
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setIsOpen(true);
  }

  function openEdit(row: Preposto) {
    setViewing(null);
    setEditing(row);
    setForm({
      nome: row.nome,
      documento: row.documento ? maskCpfCnpj(row.documento) : '',
      telefone: row.telefone ?? '',
      email: row.email ?? '',
      endereco_completo: row.endereco_completo ?? '',
      percentual_comissao: String(Number(row.percentual_comissao)),
    });
    setFormError(null);
    setIsOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name === 'documento') setForm((prev) => ({ ...prev, documento: maskCpfCnpj(value) }));
    else if (name === 'telefone') setForm((prev) => ({ ...prev, telefone: maskTel(value) }));
    else setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const nome = form.nome.trim();
    const documento = form.documento.replace(/\D/g, '');
    const percentual = Number(form.percentual_comissao.replace(',', '.'));
    if (nome.length < 2) { setFormError('Informe o nome do preposto.'); return; }
    if (documento && documento.length !== 11 && documento.length !== 14) {
      setFormError('CPF deve ter 11 dígitos e CNPJ 14.');
      return;
    }
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      setFormError('Percentual de comissão deve estar entre 0 e 100.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        nome,
        documento: documento || null,
        telefone: form.telefone.trim() || null,
        email: form.email.trim() || null,
        endereco_completo: form.endereco_completo.trim() || null,
        percentual_comissao: Math.round(percentual * 100) / 100,
      };
      if (editing) await updatePreposto(editing.uuid, { ...payload, version: editing.version });
      else await createPreposto({ ...payload, uuid: uuidDeCriacao });
      setIsOpen(false);
      reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting || saving) return;
    setSaving(true);
    setRowActionError(null);
    try {
      await deletePreposto(deleting.uuid, deleting.version);
      reload();
    } catch (err) {
      setRowActionError(getApiErrorMessage(err));
    } finally {
      setDeleting(null);
      setSaving(false);
    }
  }

  function rowMenuItems(row: Preposto): RowMenuItem[] {
    const items: RowMenuItem[] = [{ label: 'Ver', icon: Eye, onSelect: () => setViewing(row) }];
    if (hasPermission('prepostos.editar')) items.push({ label: 'Editar', icon: Pencil, onSelect: () => openEdit(row) });
    if (hasPermission('prepostos.deletar')) {
      items.push({ label: 'Excluir', icon: Trash2, danger: true, onSelect: () => { setRowActionError(null); setDeleting(row); } });
    }
    return items;
  }

  const columns = [
    { key: 'nome', header: 'Nome', cell: (row: Preposto) => row.nome },
    { key: 'documento', header: 'CPF/CNPJ', cell: (row: Preposto) => (row.documento ? maskCpfCnpj(row.documento) : '—') },
    { key: 'telefone', header: 'Telefone', cell: (row: Preposto) => row.telefone ?? '—' },
    { key: 'email', header: 'E-mail', cell: (row: Preposto) => row.email ?? '—' },
    { key: 'percentual', header: '% Comissão', cell: (row: Preposto) => formatPercent(row.percentual_comissao) },
    {
      key: 'acoes',
      header: 'Ações',
      cell: (row: Preposto) => <RowMenu label={`Ações de ${row.nome}`} items={rowMenuItems(row)} />,
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div className='relative min-w-64 flex-1 max-w-sm'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400' aria-hidden='true' />
          <input
            type='search'
            aria-label='Buscar prepostos'
            placeholder='Nome, CPF/CNPJ, telefone ou e-mail'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='w-full rounded-lg border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40'
          />
        </div>
        <Can permission='prepostos.criar'>
          <button
            type='button'
            onClick={openNew}
            className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
          >
            <Plus className='h-4 w-4' />
            Novo Preposto
          </button>
        </Can>
      </div>

      {rowActionError && (
        <div role='alert' className='rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{rowActionError}</div>
      )}

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        error={error}
        onRetry={reload}
        meta={meta ?? undefined}
        onPageChange={goToPage}
        emptyTitle={debouncedSearch ? 'Nenhum preposto encontrado' : 'Nenhum preposto cadastrado'}
        emptyDescription={debouncedSearch ? undefined : 'Prepostos cadastrados aparecem no campo Vendedor do pedido.'}
      />

      {viewing && (
        <DetailDialog
          title='Preposto'
          onClose={() => setViewing(null)}
          fields={[
            { label: 'Nome', value: viewing.nome },
            { label: 'CPF/CNPJ', value: viewing.documento ? maskCpfCnpj(viewing.documento) : null },
            { label: 'Telefone', value: viewing.telefone },
            { label: 'E-mail', value: viewing.email },
            { label: 'Endereço', value: viewing.endereco_completo },
            { label: '% Comissão', value: formatPercent(viewing.percentual_comissao) },
          ]}
          footer={
            <Can permission='prepostos.editar'>
              <button
                type='button'
                onClick={() => openEdit(viewing)}
                className='min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
              >
                Editar
              </button>
            </Can>
          }
        />
      )}

      {deleting && (
        <Dialog open title='Excluir preposto' onClose={() => setDeleting(null)} className='max-w-md'>
          <div className='space-y-4'>
            <p className='text-sm text-slate-700'>
              Excluir <strong>{deleting.nome}</strong>? Ele deixa de aparecer no campo Vendedor. O histórico de vendas é mantido.
            </p>
            <div className='flex justify-end gap-3'>
              <button type='button' onClick={() => setDeleting(null)} className='rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50'>
                Voltar
              </button>
              <button type='button' onClick={handleConfirmDelete} disabled={saving} className='min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60'>
                {saving ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {isOpen && (
        <Dialog open title={editing ? 'Editar Preposto' : 'Novo Preposto'} onClose={() => setIsOpen(false)} className='max-w-md'>
          <form onSubmit={handleSubmit} className='space-y-4'>
            {formError && (
              <div role='alert' className='rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700'>{formError}</div>
            )}
            <div className='flex flex-col gap-1'>
              <label htmlFor='preposto-nome' className={labelClass}>Nome <span className='text-red-500'>*</span></label>
              <input id='preposto-nome' name='nome' value={form.nome} onChange={handleChange} required maxLength={200} className={inputClass} />
            </div>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='preposto-documento' className={labelClass}>CPF/CNPJ</label>
                <input id='preposto-documento' name='documento' value={form.documento} onChange={handleChange} inputMode='numeric' placeholder='000.000.000-00' className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='preposto-percentual' className={labelClass}>% Comissão <span className='text-red-500'>*</span></label>
                <div className='relative'>
                  <input
                    id='preposto-percentual'
                    name='percentual_comissao'
                    type='number'
                    step='0.01'
                    min='0'
                    max='100'
                    required
                    value={form.percentual_comissao}
                    onChange={handleChange}
                    className={`${inputClass} pr-8`}
                  />
                  <span className='pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400'>%</span>
                </div>
              </div>
            </div>
            <p className='text-xs text-slate-500'>
              O percentual vale para as próximas notas. Vendas já lançadas mantêm o percentual delas (ajustável na aba Vendas).
            </p>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='preposto-telefone' className={labelClass}>Telefone</label>
                <input id='preposto-telefone' name='telefone' value={form.telefone} onChange={handleChange} inputMode='numeric' placeholder='(00) 00000-0000' className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='preposto-email' className={labelClass}>E-mail</label>
                <input id='preposto-email' name='email' type='email' value={form.email} onChange={handleChange} maxLength={200} className={inputClass} />
              </div>
            </div>
            <div className='flex flex-col gap-1'>
              <label htmlFor='preposto-endereco' className={labelClass}>Endereço</label>
              <input id='preposto-endereco' name='endereco_completo' value={form.endereco_completo} onChange={handleChange} maxLength={1000} className={inputClass} />
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
