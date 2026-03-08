import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '@/services/axiosInstance';
import type { Product } from '@/types';

type FormFields = {
  codigo: string;
  descricao: string;
  preco_base: string;
};

const empty: FormFields = {
  codigo: '',
  descricao: '',
  preco_base: '',
};

function toFields(p: Product): FormFields {
  return {
    codigo: p.codigo ?? '',
    descricao: p.descricao,
    preco_base: p.preco_base != null ? String(p.preco_base) : '',
  };
}

export default function ProdutoForm() {
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
      .get<Product>(`/produtos/${uuid}`)
      .then((r) => {
        setForm(toFields(r.data));
      })
      .catch(() => setError('Erro ao carregar produto.'))
      .finally(() => setFetching(false));
  }, [uuid]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.descricao.trim()) {
      setError('Descrição é obrigatória.');
      return;
    }
    setLoading(true);
    setError(null);

    const payload = {
      codigo: form.codigo.trim() || null,
      descricao: form.descricao.trim(),
      preco_base: form.preco_base !== '' ? Number(form.preco_base) : null,
    };

    try {
      if (isEdit) {
        await api.patch(`/produtos/${uuid}`, payload);
      } else {
        await api.post('/produtos', payload);
      }
      navigate('/produtos');
    } catch {
      setError('Erro ao salvar produto. Tente novamente.');
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

  return (
    <div className='max-w-2xl mx-auto'>
      <div className='mb-6'>
        <h1 className='text-xl font-bold text-slate-900'>
          {isEdit ? 'Editar Produto' : 'Novo Produto'}
        </h1>
        <p className='text-sm text-slate-500 mt-1'>
          {isEdit ? 'Atualize os dados do produto.' : 'Preencha os dados do novo produto.'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className='rounded-xl border border-slate-100 bg-white shadow-sm p-6 space-y-4'>
          {error && (
            <div className='rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600'>
              {error}
            </div>
          )}

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Código
            </label>
            <input
              type='text'
              name='codigo'
              value={form.codigo}
              onChange={handleChange}
              placeholder='Código do produto'
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Descrição <span className='text-red-500'>*</span>
            </label>
            <input
              type='text'
              name='descricao'
              value={form.descricao}
              onChange={handleChange}
              placeholder='Descrição do produto'
              required
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Preço Base (R$)
            </label>
            <input
              type='number'
              name='preco_base'
              value={form.preco_base}
              onChange={handleChange}
              placeholder='0.00'
              min={0}
              step='0.01'
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            />
          </div>
        </div>

        <div className='mt-4 flex items-center justify-end gap-3'>
          <button
            type='button'
            onClick={() => navigate('/produtos')}
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
