import { Bell, Menu, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  onToggle: () => void;
}

function getInitials(email: string): string {
  const parts = email.split('@')[0].split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

export default function Header({ onToggle }: HeaderProps) {
  const { user } = useAuth();
  const initials = user?.email ? getInitials(user.email) : 'U';

  return (
    <header className='flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm gap-4'>
      {/* Esquerda: botão hambúrguer */}
      <button
        onClick={onToggle}
        className='rounded-md p-2 text-slate-500 hover:bg-slate-100 transition-colors shrink-0'
        aria-label='Toggle sidebar'
      >
        <Menu className='h-5 w-5' />
      </button>

      {/* Centro: busca rápida */}
      <div className='flex-1 max-w-md'>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400' />
          <input
            type='text'
            placeholder='Busca rápida...'
            className='w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm text-slate-700 placeholder-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors'
          />
        </div>
      </div>

      {/* Direita: sino + avatar */}
      <div className='flex items-center gap-3 shrink-0'>
        {/* Sino com badge */}
        <button className='relative rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors'>
          <Bell className='h-5 w-5' />
          <span className='absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none'>
            3
          </span>
        </button>

        {/* Avatar e nome */}
        <div className='flex items-center gap-2'>
          <div
            className='flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white'
            style={{ backgroundColor: '#2A9D8F' }}
          >
            {initials}
          </div>
          <span className='hidden text-sm font-medium text-slate-700 sm:block'>
            Administrador
          </span>
        </div>
      </div>
    </header>
  );
}
