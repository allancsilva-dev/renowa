import { useNavigate } from 'react-router-dom';
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
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

// ─── Dados zerados ─────────────────────────────────────────────────────────────

const salesData = Array(6).fill(0).map((_, i) => ({
  mes: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'][i],
  valor: 0,
}));

const faturamento = 0;
const pedidosCount = 0;
const ticketMedio = 0;
const totalClientes = 0;
const pedidosAbertos = 0;
const produtosAtivos = 0;
const receitaPrevista = 0;

const desempenhoData = [
  { name: 'Atingido', value: 50, color: '#2A9D8F' },
  { name: 'Pendente', value: 30, color: '#F4A261' },
  { name: 'Abaixo',   value: 20, color: '#E76F51' },
];

const carteiraData = [
  { name: 'Ativos',   value: 50, color: '#2A9D8F' },
  { name: 'Inativos', value: 30, color: '#F4A261' },
  { name: 'Prospect', value: 20, color: '#E76F51' },
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
    <div className={`rounded-xl border border-slate-100 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className='px-5 pt-5 pb-3 border-b border-slate-100'>
      <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-500'>{title}</h2>
    </div>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
  pct: number;
  up: boolean;
}

function MetricRow({ label, value, pct, up }: MetricRowProps) {
  return (
    <div className='flex flex-col gap-0.5 py-3 border-b border-slate-100 last:border-0'>
      <span className='text-xs uppercase tracking-wide text-slate-400 font-medium'>{label}</span>
      <span className='text-2xl font-bold text-slate-900'>{value}</span>
      <div className={`flex items-center gap-1 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
        {up ? <TrendingUp className='h-3 w-3' /> : <TrendingDown className='h-3 w-3' />}
        <span>{up ? '+' : ''}{pct}% vs mês anterior</span>
      </div>
    </div>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ElementType;
  iconBg: string;
  up: boolean;
}

function KpiCard({ title, value, subtitle, icon: Icon, iconBg, up }: KpiCardProps) {
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
          <p className='text-xs font-semibold uppercase tracking-wide text-slate-400'>{title}</p>
          <p className='mt-1 text-2xl font-bold text-slate-900'>{value}</p>
          <div className={`mt-1 flex items-center gap-1 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
            {up ? <TrendingUp className='h-3 w-3' /> : <TrendingDown className='h-3 w-3' />}
            <span>{subtitle}</span>
          </div>
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
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  return (
    <div className='space-y-5'>
      {/* ── ZONA 1: Filtros + Ações ── */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        {/* Filtros */}
        <div className='flex items-center gap-3'>
          <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
            Filtrar por:
          </span>
          <select className='rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select className='rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'>
            {[2024, 2025, 2026].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Ações */}
        <div className='flex items-center gap-3'>
          <img src='/assets/logo-renowa.png' className='h-12 w-auto object-contain' alt='Renowa' />
          <button className='flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
            <Download className='h-4 w-4' />
            Exportar
          </button>
          <button className='flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'>
            <Printer className='h-4 w-4' />
            Imprimir
          </button>
          <button
            onClick={() => navigate('/pedidos/novo')}
            className='flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity'
            style={{ backgroundColor: '#2A9D8F' }}
          >
            <Plus className='h-4 w-4' />
            Novo Pedido
          </button>
        </div>
      </div>

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
                  formatter={(v: number) => [fmt(v), 'Vendas']}
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
            <MetricRow label='Faturamento'  value={fmt(faturamento)}   pct={0} up={true} />
            <MetricRow label='Pedidos'      value={String(pedidosCount)} pct={0} up={true} />
            <MetricRow label='Ticket Médio' value={fmt(ticketMedio)}   pct={0} up={false} />
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
                  formatter={(v: number) => [`${v}%`, '']}
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
          iconBg='#3B82F6'
          up={true}
        />
        <KpiCard
          title='Pedidos em Aberto'
          value={String(pedidosAbertos)}
          subtitle='Sem dados ainda'
          icon={FileText}
          iconBg='#EF4444'
          up={false}
        />
        <KpiCard
          title='Produtos Ativos'
          value={String(produtosAtivos)}
          subtitle='Sem dados ainda'
          icon={Package}
          iconBg='#2A9D8F'
          up={true}
        />
        <KpiCard
          title='Receita Prevista'
          value={fmt(receitaPrevista)}
          subtitle='Sem dados ainda'
          icon={Wallet}
          iconBg='#2A9D8F'
          up={true}
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
                  formatter={(v: number) => [`${v}%`, '']}
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
    </div>
  );
}
