import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Truck,
  DollarSign,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/clientes',      label: 'Clientes',       icon: Users },
  { to: '/pedidos',       label: 'Pedidos',        icon: ShoppingCart },
  { to: '/produtos',      label: 'Produtos',       icon: Package },
  { to: '/transporte',    label: 'Transporte',     icon: Truck },
  { to: '/financeiro',    label: 'Financeiro',     icon: DollarSign },
  { to: '/configuracoes', label: 'Configurações',  icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className='flex h-full w-60 flex-col bg-primary'>
      {/* Logo */}
      <div className='flex h-16 items-center justify-center border-b border-primary-600 px-4'>
        <div className='flex items-center gap-2'>
          {/* Reserva de espaço para Logo.jpg — substituir pela tag img quando o arquivo for fornecido */}
          <div className='h-8 w-8 rounded-md bg-white/20' />
          <span className='text-lg font-semibold text-white'>Renowa</span>
        </div>
      </div>

      {/* Navegação */}
      <nav className='flex-1 overflow-y-auto px-3 py-4'>
        <ul className='space-y-1'>
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-background text-slate-900'  // item ativo: off-white + texto escuro
                      : 'text-white hover:bg-background hover:text-slate-900', // hover: mesmo comportamento
                  )
                }
              >
                <Icon className='h-4 w-4 shrink-0' />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Rodapé do usuário */}
      <div className='border-t border-primary-600 p-3'>
        <div className='mb-2 px-3 py-1'>
          <p className='truncate text-sm font-medium text-white'>
            {user?.nome ?? 'Usuário'}
          </p>
          <p className='truncate text-xs text-white/60'>
            {user?.roles?.join(', ') ?? ''}
          </p>
        </div>
        <button
          onClick={logout}
          className='flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white hover:bg-background hover:text-slate-900 transition-colors'
        >
          <LogOut className='h-4 w-4 shrink-0' />
          Sair
        </button>
      </div>
    </aside>
  );
}
