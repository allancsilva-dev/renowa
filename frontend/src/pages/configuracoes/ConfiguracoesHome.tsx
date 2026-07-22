import { Link } from 'react-router-dom';
import { Users, ShieldCheck, ClipboardList, UserRoundCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const sections = [
  {
    to: '/configuracoes/usuarios',
    title: 'Usuários',
    description: 'Gerencie pessoas, convites e acessos da empresa.',
    icon: Users,
    permission: 'usuarios.gerenciar',
  },
  {
    to: '/configuracoes/roles',
    title: 'Perfis de acesso',
    description: 'Defina o que cada grupo de usuários pode fazer.',
    icon: ShieldCheck,
    permission: 'usuarios.gerenciar',
  },
  {
    to: '/configuracoes/auditoria',
    title: 'Auditoria LGPD',
    description: 'Consulte acessos e alterações de dados pessoais.',
    icon: ClipboardList,
    permission: 'auditoria.ver',
  },
  {
    to: '/configuracoes/privacidade',
    title: 'Solicitações de privacidade',
    description: 'Gerencie apagamento e portabilidade de dados de clientes.',
    icon: UserRoundCheck,
    permission: 'privacidade.gerenciar',
  },
];

export default function ConfiguracoesHome() {
  const { hasPermission } = useAuth();
  const visibleSections = sections.filter((section) => hasPermission(section.permission));

  return (
    <div className='rounded-lg border bg-white p-6 shadow-sm'>
      <h2 className='text-base font-semibold text-slate-900'>Selecione uma seção</h2>
      <p className='mt-1 text-sm text-slate-500'>
        Escolha o que deseja configurar.
      </p>

      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
        {visibleSections.map(({ to, title, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className='group flex items-start gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:border-primary hover:bg-slate-50'
          >
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Icon className='h-5 w-5' />
            </span>
            <span>
              <span className='block text-sm font-medium text-slate-900 group-hover:text-primary'>
                {title}
              </span>
              <span className='mt-0.5 block text-xs text-slate-500'>{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
