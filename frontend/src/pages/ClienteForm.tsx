import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/services/axiosInstance';
import type { Client } from '@/types';

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

export default function ClienteForm() {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(uuid);

  const [form, setForm] = useState<FormFields>(empty);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    setFetching(true);
    api
      .get<Client>(`/clientes/${uuid}`)
      .then((r) => {
        setForm(toFields(r.data));
      })
      .catch(() => setError('Erro ao carregar cliente.'))
      .finally(() => setFetching(false));
  }, [uuid]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razao_social.trim()) {
      setError('Razão Social é obrigatória.');
      return;
    }
    setLoading(true);
    setError(null);

    // Build payload — omit empty strings as null
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

  const field = (
    label: string,
    name: keyof FormFields,
    opts?: { required?: boolean; placeholder?: string },
  ) => (
    <div className='flex flex-col gap-1'>
      <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
        {label}
        {opts?.required && <span className='text-red-500 ml-0.5'>*</span>}
      </label>
      <input
        type='text'
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={opts?.placeholder ?? ''}
        required={opts?.required}
        className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
      />
    </div>
  );

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
              {field('Razão Social', 'razao_social', { required: true })}
              {field('CNPJ', 'cnpj', { placeholder: '00.000.000/0001-00' })}
              {field('E-mail', 'email', { placeholder: 'email@empresa.com' })}
              {field('Telefone', 'tel', { placeholder: '(00) 00000-0000' })}
              {field('Contato', 'contato')}
            </div>
          </div>

          {/* Endereço */}
          <div>
            <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4'>
              Endereço
            </h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {field('CEP', 'cep', { placeholder: '00000-000' })}
              {field('Endereço', 'endereco')}
              {field('Bairro', 'bairro')}
              {field('Cidade', 'cidade')}
              {field('UF', 'uf', { placeholder: 'SP' })}
            </div>
          </div>

          {/* Comercial */}
          <div>
            <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4'>
              Comercial
            </h2>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {field('Pagamento Padrão', 'pgt_padrao')}
              {field('Prazo', 'prazo')}
              {field('Local de Entrega', 'local_entrega')}
            </div>
          </div>

          {/* Observação */}
          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Observação
            </label>
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
