import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/apiClient';
import type { OrderStatus } from '@/types';

type FormFields = {
  data: string;
  cliente_id: string;
  status: OrderStatus;
  observacao: string;
};

const empty: FormFields = {
  data: '',
  cliente_id: '',
  status: 'em_aberto',
  observacao: '',
};

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'em_aberto', label: 'Em Aberto' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'cancelado', label: 'Cancelado' },
];

export default function PedidoForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormFields>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      data: form.data || null,
      cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      status: form.status,
      observacao: form.observacao.trim() || null,
    };

    try {
      await api.post('/pedidos', payload);
      navigate('/pedidos');
    } catch {
      setError('Erro ao salvar pedido. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='max-w-2xl mx-auto'>
      <div className='mb-6'>
        <h1 className='text-xl font-bold text-slate-900'>Novo Pedido</h1>
        <p className='text-sm text-slate-500 mt-1'>Preencha os dados do novo pedido.</p>
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
              Data
            </label>
            <input
              type='date'
              name='data'
              value={form.data}
              onChange={handleChange}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              ID do Cliente
            </label>
            <input
              type='number'
              name='cliente_id'
              value={form.cliente_id}
              onChange={handleChange}
              placeholder='ID numérico do cliente'
              min={1}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Status
            </label>
            <select
              name='status'
              value={form.status}
              onChange={handleChange}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

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

        <div className='mt-4 flex items-center justify-end gap-3'>
          <button
            type='button'
            onClick={() => navigate('/pedidos')}
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
