import { useAuth } from '@/hooks/useAuth';

export default function Configuracoes() {
  const { user } = useAuth();

  return (
    <div className='space-y-6'>
      <div className='rounded-lg border bg-white p-6 shadow-sm'>
        <h2 className='mb-4 text-base font-semibold text-slate-900'>Perfil</h2>
        <dl className='space-y-3 text-sm'>
          <div className='flex gap-4'>
            <dt className='w-32 font-medium text-slate-500'>E-mail</dt>
            <dd className='text-slate-900'>{user?.email ?? '—'}</dd>
          </div>
          <div className='flex gap-4'>
            <dt className='w-32 font-medium text-slate-500'>Tenant</dt>
            <dd className='text-slate-900'>{user?.tenantId ?? '—'}</dd>
          </div>
          <div className='flex gap-4'>
            <dt className='w-32 font-medium text-slate-500'>Role</dt>
            <dd className='text-slate-900'>{user?.role ?? '—'}</dd>
          </div>
          <div className='flex gap-4'>
            <dt className='w-32 font-medium text-slate-500'>Plano</dt>
            <dd className='text-slate-900'>—</dd>
          </div>
        </dl>
      </div>

      <div className='rounded-lg border bg-white p-6 shadow-sm'>
        <h2 className='mb-2 text-base font-semibold text-slate-900'>Sobre</h2>
        <p className='text-sm text-slate-500'>
          Renowa — Sistema de gestão comercial. Desenvolvido sobre a plataforma ZonaDev.
        </p>
      </div>
    </div>
  );
}
