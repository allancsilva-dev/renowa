import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const pageTitles: Record<string, string> = {
  '/dashboard':     'Dashboard',
  '/clientes':      'Clientes',
  '/pedidos':       'Pedidos',
  '/produtos':      'Produtos',
  '/transporte':    'Transportadoras',
  '/financeiro':    'Financeiro',
  '/configuracoes': 'Configurações',
};

export default function AppShell() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? 'Renowa';

  return (
    <div className='flex h-screen overflow-hidden bg-background'>
      <Sidebar />

      <div className='flex flex-1 flex-col overflow-hidden'>
        <Header title={title} />

        <main className='flex-1 overflow-y-auto p-6'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
