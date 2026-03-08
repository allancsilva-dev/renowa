import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingCart, DollarSign, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '@/services/axiosInstance';
import { cn } from '@/lib/utils';

interface DashboardData {
  totalReceitas: number;
  totalDespesas: number;
  totalPendentes: number;
  totalAtrasados: number;
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  colorClass: string;
}

function StatCard({ title, value, icon: Icon, colorClass }: StatCardProps) {
  return (
    <div className='rounded-lg border bg-white p-5 shadow-sm'>
      <div className='flex items-center justify-between'>
        <div>
          <p className='text-sm text-slate-500'>{title}</p>
          <p className='mt-1 text-2xl font-bold text-slate-900'>{value}</p>
        </div>
        <div className={cn('rounded-full p-3', colorClass)}>
          <Icon className='h-5 w-5 text-white' />
        </div>
      </div>
    </div>
  );
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.get<{ data: DashboardData }>('/financeiro/dashboard')
      .then((r) => setStats(r.data.data))
      .catch(() => null);
  }, []);

  const cards = [
    { title: 'Total Recebido', value: BRL.format(stats?.totalReceitas ?? 0), icon: TrendingUp, colorClass: 'bg-primary' },
    { title: 'Total Despesas', value: BRL.format(stats?.totalDespesas ?? 0), icon: DollarSign, colorClass: 'bg-slate-500' },
    { title: 'A Receber', value: BRL.format(stats?.totalPendentes ?? 0), icon: ShoppingCart, colorClass: 'bg-blue-500' },
    { title: 'Em Atraso', value: BRL.format(stats?.totalAtrasados ?? 0), icon: AlertTriangle, colorClass: 'bg-red-500' },
  ];

  return (
    <div className='space-y-6'>
      {/* KPIs */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {cards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      {/* Gráfico placeholder */}
      <div className='rounded-lg border bg-white p-5 shadow-sm'>
        <h2 className='mb-4 text-base font-semibold text-slate-900'>Receitas vs Despesas (últimos 6 meses)</h2>
        <ResponsiveContainer width='100%' height={240}>
          <AreaChart data={[]}>
            <CartesianGrid strokeDasharray='3 3' stroke='#f0f0f0' />
            <XAxis dataKey='mes' tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => BRL.format(v)} />
            <Tooltip formatter={(v: number) => BRL.format(v)} />
            <Area type='monotone' dataKey='receitas' stroke='#2A9D8F' fill='#2A9D8F20' name='Receitas' />
            <Area type='monotone' dataKey='despesas' stroke='#ef4444' fill='#ef444420' name='Despesas' />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
