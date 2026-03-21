import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/lib/apiClient';
import type { Client } from '@/types';

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
  cep: string;
  endereco: string;
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
  cep: '',
  endereco: '',
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
    cep: c.cep ?? '',
    endereco: c.endereco ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    uf: c.uf ?? '',
    pgt_padrao: c.pgt_padrao ?? '',
    prazo: c.prazo ?? '',
    local_entrega: c.local_entrega ?? '',
    observacao: c.observacao ?? '',
  };
}

// ─── Funções de máscara ─────────────────────────────────────────────────────

function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, '$1-$2');
}

function maskTel(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d{4})(\d)/, '($1) $2-$3').replace(/^(\d{2})(\d)/, '($1) $2');
  }
  return d.replace(/^(\d{2})(\d{5})(\d)/, '($1) $2-$3');
}

// ─── Componente ─────────────────────────────────────────────────────────────

export default function ClienteForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(uuid);

  const [form, setForm] = useState<FormFields>(empty);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [cepLoading, setCepLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    setFetching(true);
    api
      .get<Client>(`/clientes/${uuid}`)
      .then((r) => setForm(toFields(r.data)))
      .catch(() => setError('Erro ao carregar cliente.'))
      .finally(() => setFetching(false));
  }, [uuid]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleCnpj(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, cnpj: maskCnpj(e.target.value) }));
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
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
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
      setCepLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      setError('Razão Social é obrigatória.');
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
        await api.post('/clientes', payload);
      }
      navigate('/clientes');
    } catch {
      setError('Erro ao salvar cliente. Tente novamente.');
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
          {isEdit ? 'Editar Cliente' : 'Novo Cliente'}
        </h1>
        <p className='text-sm text-slate-500 mt-1'>
          {isEdit ? 'Atualize os dados do cliente abaixo.' : 'Preencha os dados do novo cliente.'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6 space-y-6'>
          {error && (
            <div className='rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600'>
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

              {/* CNPJ */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>CNPJ</label>
                <input
                  type='text'
                  name='cnpj'
                  value={form.cnpj}
                  onChange={handleCnpj}
                  placeholder='00.000.000/0001-00'
                  inputMode='numeric'
                  className={inputClass}
                />
              </div>

              {/* E-mail */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>E-mail</label>
                <input
                  type='text'
                  name='email'
                  value={form.email}
                  onChange={handleChange}
                  placeholder='email@empresa.com'
                  className={inputClass}
                />
              </div>

              {/* Telefone */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Telefone</label>
                <input
                  type='text'
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
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Contato</label>
                <input
                  type='text'
                  name='contato'
                  value={form.contato}
                  onChange={handleChange}
                  className={inputClass}
                />
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
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                  CEP {cepLoading && <span className='text-slate-400 normal-case font-normal'>(buscando...)</span>}
                </label>
                <input
                  type='text'
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
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Endereço</label>
                <input
                  type='text'
                  name='endereco'
                  value={form.endereco}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* Bairro */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Bairro</label>
                <input
                  type='text'
                  name='bairro'
                  value={form.bairro}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* Cidade */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Cidade</label>
                <input
                  type='text'
                  name='cidade'
                  value={form.cidade}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>

              {/* UF — dropdown */}
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>UF</label>
                <select
                  name='uf'
                  value={form.uf}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value=''>Selecione</option>
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
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Pagamento Padrão</label>
                <input type='text' name='pgt_padrao' value={form.pgt_padrao} onChange={handleChange} className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Prazo</label>
                <input type='text' name='prazo' value={form.prazo} onChange={handleChange} className={inputClass} />
              </div>
              <div className='flex flex-col gap-1'>
                <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Local de Entrega</label>
                <input type='text' name='local_entrega' value={form.local_entrega} onChange={handleChange} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Observação */}
          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Observação</label>
            <textarea
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
            className='rounded-lg px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60'
            style={{ backgroundColor: '#2A9D8F' }}
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
