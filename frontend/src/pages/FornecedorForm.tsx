import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchSupplier, createSupplier, updateSupplier, type SupplierFormData } from '@/services/suppliers.service';
import { lookupCnpj } from '@/services/consultas.service';
import type { ApiResponse, Supplier } from '@/types';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { maskCnpj, maskCep, maskTel } from '@/lib/format';
import { getApiErrorMessage } from '@/lib/errors';
import api from '@/lib/apiClient';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

type FormFields = {
  razao_social: string;
  cnpj: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  inscricao_estadual: string;
};

const empty: FormFields = {
  razao_social: '', cnpj: '', endereco: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', cep: '', telefone: '', inscricao_estadual: '',
};

function toFields(s: Supplier): FormFields {
  return {
    razao_social: s.razao_social,
    cnpj: s.cnpj ?? '',
    endereco: s.endereco ?? '',
    numero: s.numero ?? '',
    complemento: s.complemento ?? '',
    bairro: s.bairro ?? '',
    cidade: s.cidade ?? '',
    uf: s.uf ?? '',
    cep: s.cep ?? '',
    telefone: s.telefone ?? '',
    inscricao_estadual: s.inscricao_estadual ?? '',
  };
}


export default function FornecedorForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(uuid);

  const { uuid: uuidDeCriacao } = useUuidDeCriacao();
  const [form, setForm] = useState<FormFields>(empty);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);
  const [cnpjConflict, setCnpjConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cnpjAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!uuid) return;
    setFetching(true);
    fetchSupplier(uuid)
      .then((s) => setForm(toFields(s)))
      .catch(() => setError('Erro ao carregar fornecedor.'))
      .finally(() => setFetching(false));
  }, [uuid]);

  useEffect(() => () => cnpjAbortRef.current?.abort(), []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleCnpj(e: React.ChangeEvent<HTMLInputElement>) {
    setCnpjConflict(null);
    setForm((prev) => ({ ...prev, cnpj: maskCnpj(e.target.value) }));
  }

  async function handleCnpjBlur() {
    const digits = form.cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    try {
      const { data } = await api.get<ApiResponse<{ available: boolean }>>('/fornecedores/disponibilidade-cnpj', {
        params: { cnpj: digits, excludeUuid: uuid },
      });
      setCnpjConflict(data.data.available ? null : 'Este CNPJ já existe no cadastro de fornecedores.');
    } catch {
      // O POST/PATCH mantém validação definitiva; falha transitória não bloqueia edição.
    }
  }

  function handleTel(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, telefone: maskTel(e.target.value) }));
  }

  function handleCep(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, cep: maskCep(e.target.value) }));
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
      setForm((prev) => ({
        ...prev,
        razao_social: data.razao_social ?? prev.razao_social,
        endereco: data.endereco ?? prev.endereco,
        numero: data.numero ?? prev.numero,
        complemento: data.complemento ?? prev.complemento,
        bairro: data.bairro ?? prev.bairro,
        cidade: data.cidade ?? prev.cidade,
        uf: data.uf ?? prev.uf,
        cep: data.cep ? maskCep(data.cep) : prev.cep,
        telefone: data.telefone ? maskTel(data.telefone) : prev.telefone,
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      setError('Razão Social é obrigatória.');
      return;
    }
    if (cnpjConflict) {
      setError(cnpjConflict);
      return;
    }
    setLoading(true);
    setError(null);

    const payload: SupplierFormData = {
      razao_social: form.razao_social.trim(),
      cnpj: form.cnpj.trim() || null,
      endereco: form.endereco.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      cidade: form.cidade.trim() || null,
      uf: form.uf.trim() || null,
      cep: form.cep.trim() || null,
      telefone: form.telefone.trim() || null,
      inscricao_estadual: form.inscricao_estadual.trim() || null,
    };

    try {
      if (isEdit && uuid) {
        await updateSupplier(uuid, payload);
      } else {
        await createSupplier({ ...payload, uuid: uuidDeCriacao });
      }
      navigate('/fornecedores');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className='flex items-center justify-center py-20 text-slate-400 text-sm'>
        Carregando...
      </div>
    );
  }

  const inputClass = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40';

  return (
    <div className='max-w-4xl mx-auto'>
      <div className='mb-6'>
        <h1 className='text-xl font-bold text-slate-900'>
          {isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        </h1>
        <p className='text-sm text-slate-500 mt-1'>
          {isEdit ? 'Atualize os dados do fornecedor abaixo.' : 'Preencha os dados do novo fornecedor.'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6 space-y-6'>
          {error && (
            <div role='alert' className='rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700'>
              {error}
            </div>
          )}

          {/* Dados principais */}
          <div>
            <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4'>
              Dados Principais
            </h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='razao_social' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  Razão Social <span className='text-red-500'>*</span>
                </label>
                <input
                  type='text'
                  id='razao_social'
                  name='razao_social'
                  value={form.razao_social}
                  onChange={handleChange}
                  required
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='cnpj' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CNPJ</label>
                <div className='flex gap-2'>
                  <input
                    type='text'
                    id='cnpj'
                    name='cnpj'
                    value={form.cnpj}
                    onChange={handleCnpj}
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
                {cnpjMessage && (
                  <p role='status' className='mt-1 text-xs text-amber-700'>{cnpjMessage}</p>
                )}
                {cnpjConflict && <p role='alert' className='mt-1 text-xs text-red-700'>{cnpjConflict}</p>}
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='telefone' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Telefone</label>
                <input
                  type='text'
                  id='telefone'
                  name='telefone'
                  value={form.telefone}
                  onChange={handleTel}
                  placeholder='(00) 00000-0000'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='inscricao_estadual' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Inscrição estadual</label>
                <input id='inscricao_estadual' name='inscricao_estadual' value={form.inscricao_estadual} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4'>
              Endereço
            </h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='cep' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CEP</label>
                <input
                  type='text'
                  id='cep'
                  name='cep'
                  value={form.cep}
                  onChange={handleCep}
                  placeholder='00000-000'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='endereco' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Endereço</label>
                <input type='text' id='endereco' name='endereco' value={form.endereco} onChange={handleChange} className={inputClass} />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='numero' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Número</label>
                <input type='text' id='numero' name='numero' value={form.numero} onChange={handleChange} className={inputClass} />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='complemento' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Complemento</label>
                <input type='text' id='complemento' name='complemento' value={form.complemento} onChange={handleChange} className={inputClass} />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='bairro' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Bairro</label>
                <input type='text' id='bairro' name='bairro' value={form.bairro} onChange={handleChange} className={inputClass} />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='cidade' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Cidade</label>
                <input type='text' id='cidade' name='cidade' value={form.cidade} onChange={handleChange} className={inputClass} />
              </div>

              <div className='flex flex-col gap-1'>
                <label htmlFor='uf' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>UF</label>
                <select id='uf' name='uf' value={form.uf} onChange={handleChange} className={inputClass}>
                  <option value=''></option>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé */}
        <div className='mt-4 flex items-center justify-end gap-3'>
          <button
            type='button'
            onClick={() => navigate('/fornecedores')}
            className='rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
          >
            Cancelar
          </button>
          <button
            type='submit'
            disabled={loading}
            className='min-h-11 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
