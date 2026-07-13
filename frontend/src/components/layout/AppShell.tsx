import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import LoadingState from '../feedback/LoadingState';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);

  return (
    <div className='flex h-dvh overflow-hidden bg-background'>
      <a href='#main-content' className='sr-only z-50 rounded-lg bg-white px-4 py-3 text-slate-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-primary'>Pular para o conteúdo</a>
      {sidebarOpen && (
        <button type='button' aria-label='Fechar menu de navegação' className='fixed inset-0 z-30 bg-black/40 lg:hidden' onClick={() => setSidebarOpen(false)} />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-[260px] overflow-hidden transition-transform duration-200 lg:relative lg:z-auto lg:shrink-0 ${
          sidebarOpen ? 'translate-x-0 lg:w-[260px]' : '-translate-x-full lg:w-0'
        }`}
      >
        {sidebarOpen && <Sidebar />}
      </div>

      <div className='flex flex-1 flex-col overflow-hidden min-w-0'>
        <Header sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((prev) => !prev)} />

        <main id='main-content' className='flex-1 overflow-y-auto bg-background p-4 sm:p-6'>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
