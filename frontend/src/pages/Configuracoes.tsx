import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function Configuracoes() {
  const { user } = useAuth();

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border bg-white p-6 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>Configurações</h1>
        <p className='mt-1 text-sm text-slate-500'>
          Tenant: <span className='font-medium text-slate-700'>{user?.tenantId ?? '—'}</span>
          {' • '}
          Usuário: <span className='font-medium text-slate-700'>{user?.email ?? '—'}</span>
        </p>

        <div className='mt-4 flex flex-wrap gap-2'>
          <NavLink
            to='/configuracoes/usuarios'
            className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Usuários
          </NavLink>
          <NavLink
            to='/configuracoes/roles'
            className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Roles
          </NavLink>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
