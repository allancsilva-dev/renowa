import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Package,
  Truck,
  DollarSign,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const navItems = [
  { to: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
  { to: '/clientes',      label: 'Clientes',       icon: Users },
  { to: '/pedidos',       label: 'Pedidos',        icon: FileText },
  { to: '/produtos',      label: 'Produtos',       icon: Package },
  { to: '/transporte',    label: 'Transporte',     icon: Truck },
  { to: '/financeiro',    label: 'Financeiro',     icon: DollarSign },
  { to: '/configuracoes', label: 'Configurações',  icon: Settings },
];

function getInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const initials = user?.email ? getInitials(user.email) : 'U';
  const role = user?.roles?.[0] ?? '';

  return (
    <aside className='flex h-full w-60 flex-col flex-shrink-0' style={{ backgroundColor: '#0D2B2B' }}>
      {/* Logo */}
      <div className='flex h-16 items-center px-6 border-b border-white/10'>
        <span className='text-xl font-bold text-white tracking-wide'>Renowa</span>
      </div>

      {/* Navegação */}
      <nav className='flex-1 overflow-y-auto px-3 py-4'>
        <ul className='space-y-1'>
          {navItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className='flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors relative overflow-hidden'
                style={({ isActive }) =>
                  isActive
                    ? { backgroundColor: '#1A3D3D', color: 'white' }
                    : { color: 'rgba(255,255,255,0.7)' }
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className='absolute left-0 top-0 h-full w-[3px] bg-white' />
                    )}
                    <Icon className='h-4 w-4 shrink-0' />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Rodapé do usuário */}
      <div className='border-t border-white/10 p-3'>
        <div className='flex items-center gap-3 px-2 py-2 mb-1'>
          {/* Avatar circular com iniciais */}
          <div className='flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white shrink-0'>
            {initials}
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium text-white'>
              {user?.email ?? 'Usuário'}
            </p>
            {role && (
              <p className='truncate text-xs text-white/50'>{role}</p>
            )}
          </div>
        </div>
        <button
          onClick={logout}
          className='flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors'
        >
          <LogOut className='h-4 w-4 shrink-0' />
          Sair
        </button>
      </div>
    </aside>
  );
}
