import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  title = 'Ocorreu um erro',
  description = 'Não foi possível carregar os dados. Tente novamente.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className='flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center'>
      <AlertTriangle className='mb-4 h-12 w-12 text-destructive' />
      <h3 className='mb-1 text-base font-semibold text-slate-700'>{title}</h3>
      <p className='mb-4 max-w-sm text-sm text-slate-500'>{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className='rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors'
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}
