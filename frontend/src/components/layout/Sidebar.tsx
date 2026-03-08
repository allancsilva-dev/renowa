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

const mainNavItems = [
  { to: '/dashboard',  label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/clientes',   label: 'Clientes',      icon: Users },
  { to: '/pedidos',    label: 'Pedidos',       icon: FileText },
  { to: '/produtos',   label: 'Produtos',      icon: Package },
  { to: '/transporte', label: 'Transporte',    icon: Truck },
  { to: '/financeiro', label: 'Financeiro',    icon: DollarSign },
];

function getInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.substring(0, 2).toUpperCase();
}

const itemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 16px',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 500,
  transition: 'all 0.2s ease',
  color: 'rgba(255,255,255,0.7)',
  textDecoration: 'none',
  width: '100%',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
};

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const initials = user?.email ? getInitials(user.email) : 'U';
  const role = user?.roles?.[0] ?? '';

  return (
    <aside
      className='flex h-full w-[260px] flex-shrink-0 flex-col'
      style={{
        background: 'linear-gradient(180deg, #0F4F54 0%, #16595F 50%, #1A6A70 100%)',
        boxShadow: '4px 0 10px rgba(0,0,0,0.1)',
      }}
    >
      {/* Logo */}
      <div className='flex items-center gap-3 px-5 py-6'>
        <img
          src='/assets/logo-renowa-branco.png'
          alt='Renowa'
          className='h-10 w-auto object-contain shrink-0'
        />
      </div>

      {/* Navegação principal */}
      <nav className='flex-1 overflow-y-auto px-3 py-2'>
        <ul className='space-y-0.5'>
          {mainNavItems.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                style={({ isActive }) => ({
                  ...itemBase,
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                  background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains('active')) {
                    el.style.color = '#fff';
                    el.style.background = 'rgba(255,255,255,0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (!el.classList.contains('active')) {
                    el.style.color = 'rgba(255,255,255,0.7)';
                    el.style.background = 'transparent';
                  }
                }}
              >
                <Icon size={20} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Separador antes de Configurações */}
        <div className='my-3 border-t border-white/10' />

        <NavLink
          to='/configuracoes'
          style={({ isActive }) => ({
            ...itemBase,
            color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
            background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
          })}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.color = '#fff';
            el.style.background = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            if (el.getAttribute('aria-current') !== 'page') {
              el.style.color = 'rgba(255,255,255,0.7)';
              el.style.background = 'transparent';
            }
          }}
        >
          <Settings size={20} />
          Configurações
        </NavLink>
      </nav>

      {/* Rodapé do usuário */}
      <div className='border-t border-white/10 p-4'>
        {/* Info do usuário */}
        <div className='mb-3 flex items-center gap-3'>
          <div
            className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white'
            style={{ background: 'rgba(255,255,255,0.2)' }}
          >
            {initials}
          </div>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-medium text-white'>
              {user?.email ?? 'Usuário'}
            </p>
            {role && (
              <p className='truncate text-xs' style={{ color: 'rgba(255,255,255,0.5)' }}>
                {role}
              </p>
            )}
          </div>
        </div>

        {/* Botão Sair */}
        <button
          onClick={logout}
          style={itemBase}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.7)';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <LogOut size={20} />
          Sair
        </button>
      </div>
    </aside>
  );
}
