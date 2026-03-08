import { Bell } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <header className='flex h-16 items-center justify-between border-b bg-white px-6 shadow-sm'>
      <h1 className='text-xl font-semibold text-slate-900'>{title}</h1>

      <div className='flex items-center gap-3'>
        <button className='relative rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors'>
          <Bell className='h-5 w-5' />
        </button>

        <div className='flex items-center gap-2'>
          <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white'>
            {user?.email?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          <span className='hidden text-sm font-medium text-slate-700 sm:block'>
            {user?.email ?? 'Usuário'}
          </span>
        </div>
      </div>
    </header>
  );
}
