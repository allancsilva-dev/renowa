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
  Building2,
  Receipt,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Quando presente, o item só aparece se o usuário tiver essa permissão (ou for admin). */
  permission?: string;
}

const mainNavItems: NavItem[] = [
  { to: '/dashboard',     label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/clientes',      label: 'Clientes',     icon: Users },
  { to: '/pedidos',       label: 'Pedidos',      icon: FileText },
  { to: '/produtos',      label: 'Produtos',     icon: Package },
  { to: '/fornecedores',  label: 'Fornecedores', icon: Building2 },
  { to: '/transporte',    label: 'Transporte',   icon: Truck },
  // Faturamento antes de Financeiro: segue a ordem do ciclo comercial
  // (pedido -> faturamento -> caixa), não a ordem em que os módulos nasceram.
  { to: '/faturamento',   label: 'Faturamento',  icon: Receipt, permission: 'faturamento.ver' },
  { to: '/financeiro',    label: 'Financeiro',   icon: DollarSign },
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
  color: 'rgba(255,255,255,0.82)',
  textDecoration: 'none',
  width: '100%',
  cursor: 'pointer',
  background: 'transparent',
  border: 'none',
};

export default function Sidebar() {
  const { user, logout, hasPermission } = useAuth();
  const initials = user?.email ? getInitials(user.email) : 'U';
  const role = user?.roles?.[0] ?? '';
  // Configurações reúne telas com permissões próprias (usuários/perfis,
  // auditoria, privacidade) — mostra o link se o usuário tiver qualquer uma.
  const canSeeConfiguracoes = hasPermission('usuarios.gerenciar')
    || hasPermission('auditoria.ver')
    || hasPermission('privacidade.gerenciar');

  return (
    <aside
      id='primary-navigation'
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
          {mainNavItems.filter(({ permission }) => !permission || hasPermission(permission)).map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                style={({ isActive }) => ({
                  ...itemBase,
                  color: isActive ? '#1B7468' : 'rgba(255,255,255,0.82)',
                  background: isActive ? '#F4F7F6' : 'transparent',
                })}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  if (el.getAttribute('aria-current') !== 'page') {
                    el.style.color = '#0D2B2B';
                    el.style.background = '#D7EEEB';
                  }
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  if (el.getAttribute('aria-current') !== 'page') {
                    el.style.color = 'rgba(255,255,255,0.82)';
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

        {canSeeConfiguracoes && <NavLink
          to='/configuracoes'
          style={({ isActive }) => ({
            ...itemBase,
            color: isActive ? '#1B7468' : 'rgba(255,255,255,0.82)',
            background: isActive ? '#F4F7F6' : 'transparent',
          })}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            if (el.getAttribute('aria-current') !== 'page') {
              el.style.color = '#0D2B2B';
              el.style.background = '#D7EEEB';
            }
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            if (el.getAttribute('aria-current') !== 'page') {
              el.style.color = 'rgba(255,255,255,0.82)';
              el.style.background = 'transparent';
            }
          }}
        >
          <Settings size={20} />
          Configurações
        </NavLink>}
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
              <p className='truncate text-xs' style={{ color: 'rgba(255,255,255,0.75)' }}>
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
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.82)';
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
