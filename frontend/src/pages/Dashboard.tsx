import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, FileText, Plus, RefreshCw, Scale, Wallet } from 'lucide-react';
import api from '@/lib/apiClient';
import { moneyForDisplay, sumMoney } from '@/lib/decimal';
import { useAuth } from '@/hooks/useAuth';

interface DashboardData {
  totalVendas: string;
  totalCustoFixo: string;
  totalCustoRotativo: string;
  totalComissoes: string;
  totalInadimplencia: string;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Dashboard() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canViewFinance = hasPermission('financeiro.ver');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canViewFinance) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ data: DashboardData }>('/financeiro/dashboard');
      setData(response.data.data);
    } catch {
      setData(null);
      setError('Não foi possível carregar o resumo financeiro. Confira sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [canViewFinance]);

  useEffect(() => { void load(); }, [load]);

  const costs = data ? sumMoney([data.totalCustoFixo, data.totalCustoRotativo]) : '0.00';
  const balance = data
    ? moneyForDisplay(data.totalVendas) - moneyForDisplay(costs) - moneyForDisplay(data.totalComissoes)
    : 0;

  return (
    <section className='mx-auto max-w-6xl space-y-6' aria-labelledby='dashboard-title'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 id='dashboard-title' className='text-2xl font-bold text-slate-900'>Visão geral</h1>
          <p className='mt-1 text-sm text-slate-600'>Valores consolidados registrados no sistema.</p>
        </div>
        <button
          type='button'
          onClick={() => navigate('/pedidos/novo')}
          className='inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
        >
          <Plus className='h-4 w-4' aria-hidden='true' /> Novo pedido
        </button>
      </header>

      {error && (
        <div role='alert' className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
          <span className='flex items-center gap-2'><AlertCircle className='h-5 w-5' aria-hidden='true' />{error}</span>
          <button type='button' onClick={() => void load()} className='inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-3 font-semibold hover:bg-red-100'>
            <RefreshCw className='h-4 w-4' aria-hidden='true' /> Tentar novamente
          </button>
        </div>
      )}

      {!canViewFinance ? (
        <div className='rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-700'>Use os atalhos abaixo para acessar suas rotinas. Resumo financeiro disponível somente para perfis autorizados.</div>
      ) : loading ? (
        <div className='grid gap-4 md:grid-cols-2' role='status' aria-label='Carregando resumo financeiro'>
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className='h-28 animate-pulse rounded-lg bg-slate-200' />)}
        </div>
      ) : data ? (
        <div className='overflow-hidden rounded-lg border border-slate-200 bg-white'>
          <dl className='divide-y divide-slate-200'>
            <Metric icon={Wallet} label='Vendas registradas' value={data.totalVendas} />
            <Metric icon={FileText} label='Custos totais' value={costs} />
            <Metric icon={Scale} label='Comissões' value={data.totalComissoes} />
            <Metric icon={AlertCircle} label='Inadimplência em aberto' value={data.totalInadimplencia} danger={moneyForDisplay(data.totalInadimplencia) > 0} />
            <div className='flex flex-col gap-2 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6'>
              <dt className='font-semibold text-slate-800'>Saldo operacional estimado</dt>
              <dd className={`text-xl font-bold ${balance >= 0 ? 'text-teal-800' : 'text-red-700'}`}>{BRL.format(balance)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <nav aria-label='Atalhos operacionais' className='flex flex-wrap gap-2'>
        {[
          ['/clientes', 'Ver clientes'], ['/pedidos', 'Ver pedidos'], ['/produtos', 'Ver produtos'], ['/financeiro', 'Abrir financeiro'],
        ].map(([to, label]) => (
          <button key={to} type='button' onClick={() => navigate(to)} className='inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'>
            {label}<ArrowRight className='h-4 w-4' aria-hidden='true' />
          </button>
        ))}
      </nav>
    </section>
  );
}

function Metric({ icon: Icon, label, value, danger = false }: { icon: React.ElementType; label: string; value: string; danger?: boolean }) {
  return (
    <div className='flex items-center justify-between gap-4 px-4 py-4 sm:px-6'>
      <dt className='flex min-w-0 items-center gap-3 text-sm font-medium text-slate-700'>
        <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-800'><Icon className='h-5 w-5' aria-hidden='true' /></span>
        {label}
      </dt>
      <dd className={`text-right text-lg font-bold ${danger ? 'text-red-700' : 'text-slate-900'}`}>{BRL.format(moneyForDisplay(value))}</dd>
    </div>
  );
}
