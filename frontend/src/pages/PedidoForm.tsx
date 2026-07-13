import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/apiClient';
import { fetchClients } from '@/services/clients.service';
import type { Client, OrderStatus } from '@/types';
import { withGeneratedUuid } from '@/lib/entityPayload';

type FormFields = {
  data: string;
  cliente_uuid: string;
  status: OrderStatus;
  observacao: string;
};

const empty: FormFields = {
  data: '',
  cliente_uuid: '',
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
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchClients({ page: 1, limit: 100 })
      .then((result) => { if (active) setClients(result.data); })
      .catch(() => { if (active) setError('Não foi possível carregar os clientes.'); })
      .finally(() => { if (active) setClientsLoading(false); });
    return () => { active = false; };
  }, []);

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

    const payload = withGeneratedUuid({
      data: form.data || null,
      cliente_uuid: form.cliente_uuid || undefined,
      status: form.status,
      observacao: form.observacao.trim() || null,
    });

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
            <div role='alert' className='rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700'>
              {error}
            </div>
          )}

          <div className='flex flex-col gap-1'>
            <label htmlFor='pedido-data' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Data
            </label>
            <input
              type='date'
              id='pedido-data'
              name='data'
              value={form.data}
              onChange={handleChange}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            />
          </div>

          <div className='flex flex-col gap-1'>
            <label htmlFor='pedido-cliente' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Cliente
            </label>
            <select
              id='pedido-cliente'
              name='cliente_uuid'
              value={form.cliente_uuid}
              onChange={handleChange}
              disabled={clientsLoading}
              className='rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary/40'
            >
              <option value=''>{clientsLoading ? 'Carregando clientes...' : 'Selecione um cliente'}</option>
              {clients.map((client) => (
                <option key={client.uuid} value={client.uuid}>{client.razao_social}</option>
              ))}
            </select>
          </div>

          <div className='flex flex-col gap-1'>
            <label htmlFor='pedido-status' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Status
            </label>
            <select
              id='pedido-status'
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
            <label htmlFor='pedido-observacao' className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
              Observação
            </label>
            <textarea
              id='pedido-observacao'
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
            className='min-h-11 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
