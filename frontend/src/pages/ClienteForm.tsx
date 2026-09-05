import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/apiClient';
import { fetchAllPages } from '@/lib/fetchAllPages';
import type { ApiResponse, Client, Transport } from '@/types';
import { useUuidDeCriacao } from '@/hooks/useUuidDeCriacao';
import { maskCnpj, maskCep, maskTel } from '@/lib/format';
import { lookupCnpj } from '@/services/consultas.service';
import { getApiErrorMessage } from '@/lib/errors';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

type FormFields = {
  razao_social: string;
  cnpj: string;
  email: string;
  tel: string;
  contato: string;
  inscricao_estadual: string;
  suframa: string;
  transportadora_uuid: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  pgt_padrao: string;
  prazo: string;
  local_entrega: string;
  observacao: string;
};

const empty: FormFields = {
  razao_social: '',
  cnpj: '',
  email: '',
  tel: '',
  contato: '',
  inscricao_estadual: '',
  suframa: '',
  transportadora_uuid: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  pgt_padrao: '',
  prazo: '',
  local_entrega: '',
  observacao: '',
};

function toFields(c: Client): FormFields {
  return {
    razao_social: c.razao_social,
    cnpj: c.cnpj ?? '',
    email: c.email ?? '',
    tel: c.tel ?? '',
    contato: c.contato ?? '',
    inscricao_estadual: c.inscricao_estadual ?? '',
    suframa: c.suframa ?? '',
    transportadora_uuid: c.transportadora?.uuid ?? '',
    cep: c.cep ?? '',
    endereco: c.endereco ?? '',
    numero: c.numero ?? '',
    complemento: c.complemento ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    uf: c.uf ?? '',
    pgt_padrao: c.pgt_padrao ?? '',
    prazo: c.prazo ?? '',
    local_entrega: c.local_entrega ?? '',
    observacao: c.observacao ?? '',
  };
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function ClienteForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(uuid);

  const { uuid: uuidDeCriacao } = useUuidDeCriacao();
  const [form, setForm] = useState<FormFields>(empty);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState<string | null>(null);
  const [cnpjConflict, setCnpjConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transports, setTransports] = useState<Transport[]>([]);
  const cnpjAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchAllPages<Transport>('/transportadoras').then(setTransports)
      .catch(() => setError('Não foi possível carregar as transportadoras.'));
  }, []);

  useEffect(() => () => cnpjAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!uuid) return;
    setFetching(true);
    api
      .get<ApiResponse<Client>>(`/clientes/${uuid}`)
      .then((r) => setForm(toFields(r.data.data)))
      .catch(() => setError('Erro ao carregar cliente.'))
      .finally(() => setFetching(false));
  }, [uuid]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
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
      const { data } = await api.get<ApiResponse<{ available: boolean }>>('/clientes/disponibilidade-cnpj', {
        params: { cnpj: digits, excludeUuid: uuid },
      });
      setCnpjConflict(data.data.available ? null : 'Este CNPJ já existe no cadastro de clientes.');
    } catch {
      // O POST/PATCH mantém validação definitiva; falha transitória não bloqueia edição.
    }
  }

  function handleTel(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, tel: maskTel(e.target.value) }));
  }

  async function handleCep(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskCep(e.target.value);
    setForm((prev) => ({ ...prev, cep: masked }));

    const cepLimpo = masked.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;

    setCepLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`, { signal: controller.signal });
      if (!res.ok) throw new Error(`ViaCEP: ${res.status}`);
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          endereco: data.logradouro ?? prev.endereco,
          bairro: data.bairro ?? prev.bairro,
          cidade: data.localidade ?? prev.cidade,
          uf: data.uf ?? prev.uf,
        }));
      }
    } catch {
      // Falha silenciosa — usuário preenche manualmente
    } finally {
      window.clearTimeout(timeout);
      setCepLoading(false);
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
        tel: data.telefone ? maskTel(data.telefone) : prev.tel,
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

    const payload: Record<string, string | null> = {};
    (Object.keys(form) as (keyof FormFields)[]).forEach((k) => {
      if (k === 'razao_social') {
        payload[k] = form[k];
      } else {
        payload[k] = form[k].trim() === '' ? null : form[k];
      }
    });

    try {
      if (isEdit) {
        await api.patch(`/clientes/${uuid}`, payload);
      } else {
        await api.post('/clientes', { ...payload, uuid: uuidDeCriacao });
      }
      navigate('/clientes');
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
  const readonlyClass = 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none';

  // Transportadora vinculada — tel/end são exibidos automaticamente (§2.1), read-only
  const selectedTransport = transports.find((t) => t.uuid === form.transportadora_uuid);

  return (
    <div className='max-w-4xl mx-auto'>
      <div className='mb-6'>
        <h1 className='text-xl font-bold text-slate-900'>
          {isEdit ? 'Editar Cliente' : 'Novo Cliente'}
        </h1>
        <p className='text-sm text-slate-500 mt-1'>
          {isEdit ? 'Atualize os dados do cliente abaixo.' : 'Preencha os dados do novo cliente.'}
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
              {/* Razão Social */}
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

              {/* CNPJ */}
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

              {/* E-mail */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='email' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>E-mail</label>
                <input
                  type='email'
                  id='email'
                  name='email'
                  value={form.email}
                  onChange={handleChange}
                  placeholder='email@empresa.com'
                  className={inputClass}
                />
              </div>

              {/* Telefone */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='tel' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Telefone</label>
                <input
                  type='text'
                  id='tel'
                  name='tel'
                  value={form.tel}
                  onChange={handleTel}
                  placeholder='(00) 00000-0000'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              {/* Contato */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='contato' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Contato</label>
                <input
                  type='text'
                  id='contato'
                  name='contato'
                  value={form.contato}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='inscricao_estadual' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Inscrição estadual</label>
                <input id='inscricao_estadual' name='inscricao_estadual' value={form.inscricao_estadual} onChange={handleChange} className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='suframa' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>SUFRAMA</label>
                <input id='suframa' name='suframa' value={form.suframa} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div>
            <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4'>
              Endereço
            </h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {/* CEP */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='cep' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  CEP {cepLoading && <span className='text-slate-400 normal-case font-normal'>(buscando...)</span>}
                </label>
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

              {/* Endereço */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='endereco' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Endereço</label>
                <input
                  type='text'
                  id='endereco'
                  name='endereco'
                  value={form.endereco}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* Número */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='numero' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Número</label>
                <input
                  type='text'
                  id='numero'
                  name='numero'
                  value={form.numero}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* Complemento */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='complemento' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Complemento</label>
                <input
                  type='text'
                  id='complemento'
                  name='complemento'
                  value={form.complemento}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* Bairro */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='bairro' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Bairro</label>
                <input
                  type='text'
                  id='bairro'
                  name='bairro'
                  value={form.bairro}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* Cidade */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='cidade' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Cidade</label>
                <input
                  type='text'
                  id='cidade'
                  name='cidade'
                  value={form.cidade}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* UF — dropdown */}
              <div className='flex flex-col gap-1'>
                <label htmlFor='uf' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>UF</label>
                <select
                  id='uf'
                  name='uf'
                  value={form.uf}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value=''></option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Comercial */}
          <div>
            <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4'>
              Comercial
            </h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='flex flex-col gap-1'>
                <label htmlFor='pgt_padrao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Pagamento padrão</label>
                <input id='pgt_padrao' type='text' name='pgt_padrao' value={form.pgt_padrao} onChange={handleChange} className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='prazo' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Prazo</label>
                <input id='prazo' type='text' name='prazo' value={form.prazo} onChange={handleChange} className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='local_entrega' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Local de entrega</label>
                <input id='local_entrega' type='text' name='local_entrega' value={form.local_entrega} onChange={handleChange} className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label htmlFor='transportadora_uuid' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Transportadora</label>
                <select id='transportadora_uuid' name='transportadora_uuid' value={form.transportadora_uuid} onChange={handleChange} className={inputClass}>
                  <option value=''></option>
                  {transports.map((transport) => <option key={transport.uuid} value={transport.uuid}>{transport.razao_social}</option>)}
                </select>
              </div>
              {/* Tel. Transporte — preenchido automaticamente ao vincular transportadora */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Tel. Transporte</label>
                <input type='text' value={selectedTransport?.telefone ?? ''} readOnly placeholder='Selecione a transportadora' className={readonlyClass} />
              </div>
              {/* End. Transporte — preenchido automaticamente ao vincular transportadora */}
              <div className='flex flex-col gap-1 sm:col-span-2'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>End. Transporte</label>
                <input type='text' value={selectedTransport?.endereco_completo ?? ''} readOnly placeholder='Selecione a transportadora' className={readonlyClass} />
              </div>
            </div>
          </div>

          {/* Observação */}
          <div className='flex flex-col gap-1'>
            <label htmlFor='observacao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</label>
            <textarea
              id='observacao'
              name='observacao'
              value={form.observacao}
              onChange={handleChange}
              rows={4}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 resize-none'
            />
          </div>
        </div>

        {/* Rodapé */}
        <div className='mt-4 flex items-center justify-end gap-3'>
          <button
            type='button'
            onClick={() => navigate('/clientes')}
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
