import { useState, useCallback, useEffect, useRef } from 'react';
import { Eye, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import DataTable from '@/components/tables/DataTable';
import ImportCsvDialog from '@/components/ImportCsvDialog';
import { CSV_TEMPLATE_HEADERS } from '@/lib/csvTemplate';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import api from '@/lib/apiClient';
import Dialog from '@/components/ui/Dialog';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { importTransportadoras } from '@/services/import';
import type { ApiResponse, PaginatedResponse, Transport } from '@/types';
import { Can } from '@/components/Can';
import { RowAction, RowActions } from '@/components/tables/RowActions';
import DetailDialog from '@/components/ui/DetailDialog';
import { lookupCnpj } from '@/services/consultas.service';
import { maskCnpj, maskTel, formatEnderecoCompleto } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';

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


const inputClass =
  'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A9D8F] focus:ring-1 focus:ring-[#2A9D8F]/40 w-full';

export default function Transporte() {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<NovaTransportadoraForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [viewing, setViewing] = useState<Transport | null>(null);
  const [deletingUuid, setDeletingUuid] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);
  const [cnpjConflict, setCnpjConflict] = useState<string | null>(null);
  const cnpjAbortRef = useRef<AbortController | null>(null);
  // Modal reaproveitado: a identidade da criação renova a cada abertura de
  // "Nova", e sobrevive a quantas tentativas o mesmo cadastro precisar.
  const { uuid: uuidDeCriacao, renovar: renovarUuidDeCriacao } = useUuidDeCriacao();

  const fetcher = useCallback(
    (params: { page: number; limit: number }) =>
      api.get<PaginatedResponse<Transport>>('/transportadoras', { params }).then((r) => r.data),
    [],
  );

  const { data, meta, isLoading, error, goToPage, reload } = usePaginatedQuery<Transport>({ fetcher });

  useEffect(() => () => cnpjAbortRef.current?.abort(), []);

  function openEdit(row: Transport) {
    setViewing(null);
    setEditingUuid(row.uuid);
    setForm({
      razao_social: row.razao_social,
      cnpj: row.cnpj ?? '',
      telefone: row.telefone ?? '',
      endereco_completo: row.endereco_completo ?? '',
    });
    setFormError(null);
    setCnpjMessage(null);
    setCnpjConflict(null);
    setIsOpen(true);
  }

  const columns = [
    { key: 'razao_social', header: 'Razão Social', cell: (row: Transport) => row.razao_social },
    { key: 'cnpj', header: 'CNPJ', cell: (row: Transport) => row.cnpj ?? '—' },
    { key: 'telefone', header: 'Telefone', cell: (row: Transport) => row.telefone ?? '—' },
    { key: 'endereco', header: 'Endereço', cell: (row: Transport) => row.endereco_completo ?? '—' },
    { key: 'acoes', header: 'Ações', cell: (row: Transport) => (
      <RowActions>
        <RowAction icon={Eye} label={`Ver ${row.razao_social}`} onClick={() => setViewing(row)} />
        <Can permission='transportadoras.editar'>
          <RowAction icon={Pencil} label={`Editar ${row.razao_social}`} onClick={() => openEdit(row)} />
        </Can>
        <Can permission='transportadoras.deletar'>
          <RowAction
            icon={Trash2}
            danger
            label={`Excluir ${row.razao_social}`}
            disabled={deletingUuid === row.uuid}
            onClick={() => void handleDelete(row)}
          />
        </Can>
      </RowActions>
    ) },
  ];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    if (name === 'cnpj') {
      setCnpjConflict(null);
      setForm((prev) => ({ ...prev, cnpj: maskCnpj(value) }));
    } else if (name === 'telefone') {
      setForm((prev) => ({ ...prev, telefone: maskTel(value) }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  async function handleCnpjBlur() {
    const digits = form.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    try {
      const { data } = await api.get<ApiResponse<{ available: boolean }>>('/transportadoras/disponibilidade-cnpj', {
        params: { cnpj: digits, excludeUuid: editingUuid },
      });
      setCnpjConflict(data.data.available ? null : 'Este CNPJ já existe no cadastro de transportadoras.');
    } catch {
      // O POST/PATCH mantém validação definitiva; falha transitória não bloqueia edição.
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      setFormError('Razão Social é obrigatória.');
      return;
    }
    if (cnpjConflict) {
      setFormError(cnpjConflict);
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
      else await api.post('/transportadoras', { ...payload, uuid: uuidDeCriacao });
      setIsOpen(false);
      setForm(emptyForm);
      reload();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(transport: Transport) {
    if (deletingUuid) return;
    if (!window.confirm(`Excluir a transportadora “${transport.razao_social}”?`)) return;
    setDeletingUuid(transport.uuid);
    setRowActionError(null);
    try {
      await api.delete(`/transportadoras/${transport.uuid}`);
      reload();
    } catch (err) {
      setRowActionError(getApiErrorMessage(err));
    } finally {
      setDeletingUuid(null);
    }
  }

  async function handleConsultarCnpj() {
    const cnpjLimpo = form.cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      setCnpjMessage('Informe um CNPJ completo (14 dígitos) para consultar.');
      return;
    }

    cnpjAbortRef.current?.abort();
    const controller = new AbortController();
    cnpjAbortRef.current = controller;

    setCnpjLoading(true);
    setCnpjMessage(null);
    try {
      const data = await lookupCnpj(cnpjLimpo, { signal: controller.signal });
      // A transportadora guarda o endereço num campo só; a consulta devolve as
      // partes separadas. Compor aqui evita mexer no schema — e nunca
      // sobrescrever com string vazia se a consulta vier sem endereço.
      const endereco = formatEnderecoCompleto(data);
      setForm((prev) => ({
        ...prev,
        razao_social: data.razao_social ?? prev.razao_social,
        telefone: data.telefone ? maskTel(data.telefone) : prev.telefone,
        endereco_completo: endereco || prev.endereco_completo,
      }));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) setCnpjMessage('CNPJ não encontrado. Preencha os dados manualmente.');
      else if (status === 503) setCnpjMessage('Serviço de consulta de CNPJ indisponível no momento. Preencha os dados manualmente.');
      else if ((err as { name?: string })?.name !== 'AbortError') setCnpjMessage('Não foi possível consultar o CNPJ. Preencha os dados manualmente.');
    } finally {
      setCnpjLoading(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex justify-end gap-2'>
        <Can permission='transportadoras.criar'>
          <button
            onClick={() => setIsImportOpen(true)}
            className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors'
          >
            <Upload className='h-4 w-4' />
            Importar
          </button>
        </Can>
        <Can permission='transportadoras.criar'>
          <button
            onClick={() => { renovarUuidDeCriacao(); setIsOpen(true); setEditingUuid(null); setForm(emptyForm); setFormError(null); setCnpjMessage(null); }}
            className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-800 transition-colors'
          >
            <Plus className='h-4 w-4' />
            Nova Transportadora
          </button>
        </Can>
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
        emptyTitle='Nenhuma transportadora cadastrada'
      />

      {isImportOpen && (
        <ImportCsvDialog
          title='Importar transportadoras'
          template={{ filename: 'modelo-transporte.csv', header: CSV_TEMPLATE_HEADERS.transporte }}
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

      {viewing && (
        <DetailDialog
          title='Transportadora'
          onClose={() => setViewing(null)}
          fields={[
            { label: 'Razão Social', value: viewing.razao_social },
            { label: 'CNPJ', value: viewing.cnpj },
            { label: 'Telefone', value: viewing.telefone },
            { label: 'Endereço', value: viewing.endereco_completo },
          ]}
          footer={
            <Can permission='transportadoras.editar'>
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
                <div className='flex gap-2'>
                  <input
                    type='text'
                    id='transportadora-cnpj'
                    name='cnpj'
                    value={form.cnpj}
                    onChange={handleChange}
                    onBlur={handleCnpjBlur}
                    placeholder='00.000.000/0001-00'
                    inputMode='numeric'
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    type='button'
                    onClick={handleConsultarCnpj}
                    disabled={cnpjLoading}
                    className='min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60'
                  >
                    {cnpjLoading ? 'Consultando...' : 'Consultar CNPJ'}
                  </button>
                </div>
                {cnpjMessage && <p className='text-xs text-amber-700'>{cnpjMessage}</p>}
                {cnpjConflict && <p role='alert' className='text-xs text-red-700'>{cnpjConflict}</p>}
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
