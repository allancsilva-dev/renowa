import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/apiClient';
import { moneyForDisplay, sumMoney } from '@/lib/decimal';
import { useAuth } from '@/hooks/useAuth';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from 'recharts';
import {
  Users,
  FileText,
  Package,
  Wallet,
  Download,
  Printer,
  Plus,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface DashboardData {
  totalVendas: string;
  totalCustoFixo: string;
  totalCustoRotativo: string;
  totalComissoes: string;
  totalInadimplencia: string;
}

// ─── Dados zerados ─────────────────────────────────────────────────────────────

const salesData = Array(6).fill(0).map((_, i) => ({
  mes: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'][i],
  valor: 0,
}));

const totalClientes = 0;
const pedidosAbertos = 0;
const produtosAtivos = 0;

const desempenhoData = [
  { name: 'Atingido', value: 0, color: '#2A9D8F' },
  { name: 'Pendente', value: 0, color: '#F4A261' },
  { name: 'Abaixo',   value: 0, color: '#E76F51' },
];

const carteiraData = [
  { name: 'Ativos',   value: 0, color: '#2A9D8F' },
  { name: 'Inativos', value: 0, color: '#F4A261' },
  { name: 'Prospect', value: 0, color: '#E76F51' },
];

const positivacaoData = [
  { name: 'Positivação', value: 0, fill: '#2A9D8F' },
];

const abcData: { cliente: string; valor: string; badge: string }[] = [];

// ─── Formatação ────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(v);

// ─── Sub-componentes ───────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className='border-b border-slate-100 px-5 pb-3 pt-5'>
      <h2 className='text-sm font-semibold text-slate-800'>{title}</h2>
    </div>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
  caption: string;
  danger?: boolean;
}

function MetricRow({ label, value, caption, danger = false }: MetricRowProps) {
  return (
    <div className='flex flex-col gap-0.5 py-3 border-b border-slate-100 last:border-0'>
      <span className='text-xs font-medium text-slate-600'>{label}</span>
      <span className={`text-2xl font-bold ${danger ? 'text-red-700' : 'text-slate-900'}`}>{value}</span>
      <span className='text-xs text-slate-500'>{caption}</span>
    </div>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconBg: string;
}

function KpiCard({ title, value, subtitle, icon: Icon, iconBg }: KpiCardProps) {
  return (
    <Card>
      <div className='p-5 flex items-start gap-4'>
        <div
          className='flex h-11 w-11 items-center justify-center rounded-full shrink-0'
          style={{ backgroundColor: iconBg + '1A' }}
        >
          <Icon className='h-5 w-5' style={{ color: iconBg }} />
        </div>
        <div className='min-w-0 flex-1'>
          <p className='text-xs font-semibold text-slate-600'>{title}</p>
          <p className='mt-1 text-2xl font-bold text-slate-900'>{value}</p>
          <p className='mt-1 text-xs font-medium text-slate-500'>{subtitle}</p>
        </div>
      </div>
    </Card>
  );
}

function badgeStyle(badge: string): string {
  if (badge === 'Prioridade') return 'bg-teal-100 text-teal-700';
  if (badge === 'Atenção') return 'bg-orange-100 text-orange-700';
  return 'bg-slate-100 text-slate-600';
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canViewFinance = hasPermission('financeiro.ver');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(canViewFinance);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canViewFinance) return;
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

  const faturamento = moneyForDisplay(data?.totalVendas);
  const custos = moneyForDisplay(sumMoney([data?.totalCustoFixo, data?.totalCustoRotativo]));
  const comissoes = moneyForDisplay(data?.totalComissoes);
  const inadimplencia = moneyForDisplay(data?.totalInadimplencia);
  const saldo = faturamento - custos - comissoes;

  const handleExport = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Métrica,Valor\n' +
      `Faturamento,${faturamento}\n` +
      `Custos,${custos}\n` +
      `Comissões,${comissoes}\n` +
      `Inadimplência,${inadimplencia}\n` +
      `Saldo operacional,${saldo}`;
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = 'dashboard_consolidado.csv';
    link.click();
  };

  const handlePrint = () => window.print();

  return (
    <section className='space-y-5' aria-labelledby='dashboard-title'>
      {/* ── ZONA 1: Cabeçalho + Ações ── */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 id='dashboard-title' className='text-2xl font-bold text-slate-900'>Dashboard</h1>
          <p className='mt-1 text-sm text-slate-600'>Visão consolidada da operação comercial.</p>
        </div>

        {/* Ações */}
        <div className='flex flex-wrap items-center gap-3'>
          <img src='/assets/logo-renowa.png' className='hidden h-12 w-auto object-contain sm:block' alt='Renowa' />
          <button
            type='button'
            onClick={handleExport}
            disabled={!data}
            className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50'
          >
            <Download className='h-4 w-4' />
            Exportar
          </button>
          <button
            type='button'
            onClick={handlePrint}
            className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          >
            <Printer className='h-4 w-4' />
            Imprimir
          </button>
          <button
            type='button'
            onClick={() => navigate('/pedidos/novo')}
            className='flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          >
            <Plus className='h-4 w-4' />
            Novo Pedido
          </button>
        </div>
      </div>

      {error && (
        <div role='alert' className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800'>
          <span className='flex items-center gap-2'><AlertCircle className='h-5 w-5' />{error}</span>
          <button type='button' onClick={() => void load()} className='inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-300 px-3 font-semibold hover:bg-red-100'>
            <RefreshCw className='h-4 w-4' /> Tentar novamente
          </button>
        </div>
      )}

      {!canViewFinance && (
        <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700'>Indicadores financeiros disponíveis somente para perfis autorizados. Demais áreas do dashboard continuam acessíveis.</div>
      )}

      {/* ── ZONA 2: Gráfico principal + Métricas + Desempenho ── */}
      <div className='grid grid-cols-12 gap-4'>
        {/* Col 1: Evolução de Venda (~50%) */}
        <Card className='col-span-12 lg:col-span-6'>
          <CardHeader title='Evolução de Venda' />
          <div className='px-5 py-4'>
            <ResponsiveContainer width='100%' height={220}>
              <AreaChart data={salesData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id='colorVendas' x1='0' y1='0' x2='0' y2='1'>
                    <stop offset='5%' stopColor='#2A9D8F' stopOpacity={0.2} />
                    <stop offset='95%' stopColor='#2A9D8F' stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' vertical={false} />
                <XAxis
                  dataKey='mes'
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value) => [fmt(Number(value ?? 0)), 'Vendas']}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                />
                <Area
                  type='monotone'
                  dataKey='valor'
                  stroke='#2A9D8F'
                  strokeWidth={2.5}
                  fill='url(#colorVendas)'
                  dot={{ fill: '#2A9D8F', r: 4, strokeWidth: 0 }}
                  activeDot={{ r: 6, fill: '#2A9D8F' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Col 2: 3 Métricas (~20%) */}
        <Card className='col-span-12 lg:col-span-3'>
          <CardHeader title='Resumo' />
          <div className='px-5'>
            <MetricRow label='Faturamento' value={loading ? '—' : fmt(faturamento)} caption='Vendas registradas' />
            <MetricRow label='Custos' value={loading ? '—' : fmt(custos)} caption='Fixos e rotativos' />
            <MetricRow label='Comissões' value={loading ? '—' : fmt(comissoes)} caption='Total acumulado' />
          </div>
        </Card>

        {/* Col 3: Desempenho Mensal (~30%) */}
        <Card className='col-span-12 lg:col-span-3'>
          <CardHeader title='Desempenho Mensal' />
          <div className='flex flex-col items-center px-5 py-4 gap-3'>
            <ResponsiveContainer width='100%' height={160}>
              <PieChart>
                <Pie
                  data={desempenhoData}
                  cx='50%'
                  cy='50%'
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey='value'
                  startAngle={90}
                  endAngle={-270}
                >
                  {desempenhoData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${Number(value ?? 0)}%`, '']}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legenda */}
            <div className='w-full space-y-1'>
              {desempenhoData.map((d) => (
                <div key={d.name} className='flex items-center justify-between text-xs'>
                  <div className='flex items-center gap-1.5'>
                    <span className='h-2.5 w-2.5 rounded-full' style={{ backgroundColor: d.color }} />
                    <span className='text-slate-500'>{d.name}</span>
                  </div>
                  <span className='font-semibold text-slate-700'>{d.value}%</span>
                </div>
              ))}
            </div>

            {/* Barra de progresso de meta */}
            <div className='w-full'>
              <div className='flex justify-between text-xs text-slate-500 mb-1'>
                <span>Meta</span>
                <span className='font-semibold text-slate-700'>0%</span>
              </div>
              <div className='h-2 w-full rounded-full bg-slate-100'>
                <div
                  className='h-2 rounded-full'
                  style={{ width: '0%', backgroundColor: '#2A9D8F' }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── ZONA 3: 4 cards KPI ── */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <KpiCard
          title='Total de Clientes'
          value={String(totalClientes)}
          subtitle='Sem dados ainda'
          icon={Users}
          iconBg='#2A9D8F'
        />
        <KpiCard
          title='Pedidos em Aberto'
          value={String(pedidosAbertos)}
          subtitle='Sem dados ainda'
          icon={FileText}
          iconBg='#2A9D8F'
        />
        <KpiCard
          title='Produtos Ativos'
          value={String(produtosAtivos)}
          subtitle='Sem dados ainda'
          icon={Package}
          iconBg='#2A9D8F'
        />
        <KpiCard
          title='Inadimplência em Aberto'
          value={loading ? '—' : fmt(inadimplencia)}
          subtitle={inadimplencia > 0 ? 'Requer atenção' : 'Nenhum valor em aberto'}
          icon={Wallet}
          iconBg={inadimplencia > 0 ? '#B91C1C' : '#2A9D8F'}
        />
      </div>

      {/* ── ZONA 4: Carteira + Positivação + Curva ABC ── */}
      <div className='grid grid-cols-12 gap-4'>
        {/* Col 1: Carteira de Clientes */}
        <Card className='col-span-12 lg:col-span-4'>
          <CardHeader title='Carteira de Clientes' />
          <div className='flex flex-col items-center px-5 py-4 gap-3'>
            <ResponsiveContainer width='100%' height={180}>
              <PieChart>
                <Pie
                  data={carteiraData}
                  cx='50%'
                  cy='50%'
                  innerRadius={52}
                  outerRadius={76}
                  paddingAngle={2}
                  dataKey='value'
                  startAngle={90}
                  endAngle={-270}
                >
                  {carteiraData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${Number(value ?? 0)}%`, '']}
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className='w-full space-y-1.5'>
              {carteiraData.map((d) => (
                <div key={d.name} className='flex items-center justify-between text-xs'>
                  <div className='flex items-center gap-1.5'>
                    <span className='h-2.5 w-2.5 rounded-full shrink-0' style={{ backgroundColor: d.color }} />
                    <span className='text-slate-500'>{d.name}</span>
                  </div>
                  <span className='font-semibold text-slate-700'>{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Col 2: Positivação */}
        <Card className='col-span-12 lg:col-span-4'>
          <CardHeader title='Positivação' />
          <div className='flex flex-col items-center justify-center px-5 py-4 gap-2'>
            {/* RadialBarChart como gauge */}
            <ResponsiveContainer width='100%' height={180}>
              <RadialBarChart
                cx='50%'
                cy='70%'
                innerRadius='60%'
                outerRadius='90%'
                startAngle={180}
                endAngle={0}
                data={positivacaoData}
              >
                <RadialBar
                  dataKey='value'
                  cornerRadius={6}
                  background={{ fill: '#f1f5f9' }}
                  fill='#2A9D8F'
                />
              </RadialBarChart>
            </ResponsiveContainer>

            <div className='text-center -mt-8'>
              <p className='text-4xl font-bold text-slate-900'>0%</p>
              <p className='mt-1 text-sm font-semibold text-slate-400'>Sem dados</p>
              <p className='text-xs text-slate-400'>Taxa de positivação mensal</p>
            </div>
          </div>
        </Card>

        {/* Col 3: Curva ABC de Clientes */}
        <Card className='col-span-12 lg:col-span-4'>
          <CardHeader title='Curva ABC de Clientes' />
          <div className='px-5 py-3'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='text-xs uppercase text-slate-400 font-semibold border-b border-slate-100'>
                  <th className='pb-2 text-left font-medium'>Cliente</th>
                  <th className='pb-2 text-right font-medium'>Valor</th>
                  <th className='pb-2 text-right font-medium'>Curva</th>
                </tr>
              </thead>
              <tbody>
                {abcData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className='py-6 text-center text-sm text-slate-400'>
                      Nenhum dado
                    </td>
                  </tr>
                ) : (
                  abcData.map((row, i) => (
                    <tr
                      key={row.cliente}
                      className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
                    >
                      <td className='py-2.5 pr-2'>
                        <span className='font-medium text-slate-700 text-xs leading-snug'>
                          {row.cliente}
                        </span>
                      </td>
                      <td className='py-2.5 text-right text-xs font-semibold text-slate-900 whitespace-nowrap'>
                        {row.valor}
                      </td>
                      <td className='py-2.5 text-right'>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeStyle(row.badge)}`}
                        >
                          {row.badge}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </section>
  );
}
