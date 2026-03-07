import { InboxIcon } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({
  title = 'Nenhum resultado',
  description = 'Não encontramos registros para os filtros aplicados.',
  action,
}: EmptyStateProps) {
  return (
    <div className='flex flex-col items-center justify-center rounded-lg border border-dashed bg-white py-16 text-center'>
      <InboxIcon className='mb-4 h-12 w-12 text-slate-300' />
      <h3 className='mb-1 text-base font-semibold text-slate-700'>{title}</h3>
      <p className='mb-4 max-w-sm text-sm text-slate-500'>{description}</p>
      {action}
    </div>
  );
}
