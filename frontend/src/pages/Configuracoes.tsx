import { NavLink, Outlet } from 'react-router-dom';

export default function Configuracoes() {
  return (
    <div className='space-y-4'>
      <div className='rounded-lg border bg-white p-6 shadow-sm'>
        <h1 className='text-lg font-semibold text-slate-900'>Configurações</h1>
        <p className='mt-1 text-sm text-slate-500'>
          Gerencie equipe, acessos e privacidade da empresa.
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
            Perfis de acesso
          </NavLink>
          <NavLink
            to='/configuracoes/auditoria'
            className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Auditoria LGPD
          </NavLink>
          <NavLink to='/configuracoes/privacidade' className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? 'bg-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>Solicitações de privacidade</NavLink>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
