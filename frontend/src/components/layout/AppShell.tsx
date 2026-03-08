import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className='flex h-screen overflow-hidden' style={{ backgroundColor: '#F4F7F6' }}>
      {/* Sidebar com transição suave */}
      <div
        className={`overflow-hidden transition-all duration-200 ${
          sidebarOpen ? 'w-60' : 'w-0'
        }`}
      >
        <Sidebar />
      </div>

      <div className='flex flex-1 flex-col overflow-hidden min-w-0'>
        <Header onToggle={() => setSidebarOpen((prev) => !prev)} />

        <main className='flex-1 overflow-y-auto p-6' style={{ backgroundColor: '#F4F7F6' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
