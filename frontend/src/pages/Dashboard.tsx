import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/apiClient';
import { moneyForDisplay, sumMoney } from '@/lib/decimal';
import { useAuth } from '@/hooks/useAuth';
import logoRenowa from '@/assets/logo-renowa.png';
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
  Eye,
  EyeOff,
} from 'lucide-react';

interface DashboardData {
  totalVendas: string;
  totalCustoFixo: string;
  totalCustoRotativo: string;
  totalComissoes: string;
  totalInadimplencia: string;
  pedidosAbertos: number;
  produtosAtivos: number;
  carteira: { total: number; ativos: number; inativos: number; prospect: number };
  clientesInativos: { clienteUuid: string; cliente: string; ultimoPedidoEm: string; diasSemPedido: number }[];
  vendasMensais: { mes: string; valor: string }[];
  curvaAbc: { cliente: string; valor: string; badge: 'Prioridade' | 'Atenção' | 'Regular' }[];
}

const MES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function mesLabel(mesKey: string): string {
  const [, month] = mesKey.split('-');
  return MES_LABELS[Number(month) - 1] ?? mesKey;
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

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
  const [valoresOcultos, setValoresOcultos] = useState<boolean>(
    () => localStorage.getItem('dashboard_valores_ocultos') === '1',
  );

  useEffect(() => {
    localStorage.setItem('dashboard_valores_ocultos', valoresOcultos ? '1' : '0');
  }, [valoresOcultos]);

  const showMoney = (v: number) => (valoresOcultos ? 'R$ ••••••' : fmt(v));

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

  const totalClientes = data?.carteira.total ?? 0;
  const pedidosAbertos = data?.pedidosAbertos ?? 0;
  const produtosAtivos = data?.produtosAtivos ?? 0;

  const salesData = (data?.vendasMensais ?? []).map((v) => ({
    mes: mesLabel(v.mes),
    valor: moneyForDisplay(v.valor),
  }));

  const carteira = data?.carteira ?? { total: 0, ativos: 0, inativos: 0, prospect: 0 };
  const carteiraData = [
    { name: 'Ativos',   value: pct(carteira.ativos, carteira.total),   color: '#2A9D8F' },
    { name: 'Inativos', value: pct(carteira.inativos, carteira.total), color: '#F4A261' },
    { name: 'Prospect', value: pct(carteira.prospect, carteira.total), color: '#E76F51' },
  ];

  const abcData = data?.curvaAbc ?? [];
  const clientesInativos = data?.clientesInativos ?? [];

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
          <img src={logoRenowa} className='hidden h-12 w-auto object-contain sm:block' alt='Renowa' />
          <button
            type='button'
            onClick={() => setValoresOcultos((v) => !v)}
            aria-pressed={valoresOcultos}
            aria-label={valoresOcultos ? 'Mostrar valores' : 'Ocultar valores'}
            title={valoresOcultos ? 'Mostrar valores' : 'Ocultar valores'}
            className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          >
            {valoresOcultos ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
            {valoresOcultos ? 'Mostrar' : 'Ocultar'}
          </button>
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
        <div className='rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700'>Este dashboard está disponível somente para perfis com permissão de visualizar o financeiro.</div>
      )}

      {/* ── ZONA 2: Gráfico principal + Métricas + Desempenho ── */}
      <div className='grid grid-cols-12 gap-4'>
        {/* Col 1: Evolução de Venda (~65%) */}
        <Card className='col-span-12 lg:col-span-8'>
          <CardHeader title='Evolução de Venda' />
          <div className={`px-5 py-4 ${valoresOcultos ? 'blur-sm select-none pointer-events-none' : ''}`}>
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
                  tick={valoresOcultos ? false : { fontSize: 11, fill: '#6B7280' }}
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

        {/* Col 2: 3 Métricas (~35%) */}
        <Card className='col-span-12 lg:col-span-4'>
          <CardHeader title='Resumo' />
          <div className='px-5'>
            <MetricRow label='Faturamento' value={loading ? '—' : showMoney(faturamento)} caption='Vendas registradas' />
            <MetricRow label='Custos' value={loading ? '—' : showMoney(custos)} caption='Fixos e rotativos' />
            <MetricRow label='Comissões' value={loading ? '—' : showMoney(comissoes)} caption='Total acumulado' />
          </div>
        </Card>
      </div>

      {/* ── ZONA 3: 4 cards KPI ── */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <KpiCard
          title='Total de Clientes'
          value={String(totalClientes)}
          subtitle={totalClientes > 0 ? 'Carteira cadastrada' : 'Sem dados ainda'}
          icon={Users}
          iconBg='#2A9D8F'
        />
        <KpiCard
          title='Pedidos em Aberto'
          value={String(pedidosAbertos)}
          subtitle={pedidosAbertos > 0 ? 'Aguardando conclusão' : 'Sem dados ainda'}
          icon={FileText}
          iconBg='#2A9D8F'
        />
        <KpiCard
          title='Produtos Ativos'
          value={String(produtosAtivos)}
          subtitle={produtosAtivos > 0 ? 'Catálogo ativo' : 'Sem dados ainda'}
          icon={Package}
          iconBg='#2A9D8F'
        />
        <KpiCard
          title='Inadimplência em Aberto'
          value={loading ? '—' : showMoney(inadimplencia)}
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

        {/* Col 2: clientes sem pedido válido há mais de 30 dias */}
        <Card className='col-span-12 lg:col-span-4'>
          <CardHeader title='Clientes inativos' />
          <div className='max-h-64 overflow-y-auto px-5 py-3'>
            {clientesInativos.length === 0 ? (
              <div className='py-10 text-center'>
                <p className='text-sm font-medium text-slate-700'>Nenhum cliente inativo</p>
                <p className='mt-1 text-xs text-slate-500'>Clientes com pedido nos últimos 30 dias estão em dia.</p>
              </div>
            ) : clientesInativos.map((cliente) => (
              <div key={cliente.clienteUuid} className='flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-0'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-slate-800'>{cliente.cliente}</p>
                  <p className='mt-0.5 text-xs text-slate-500'>Último pedido: {cliente.ultimoPedidoEm.split('-').reverse().join('/')}</p>
                </div>
                <span className='shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700'>{cliente.diasSemPedido} dias</span>
              </div>
            ))}
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
                        {showMoney(moneyForDisplay(row.valor))}
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
