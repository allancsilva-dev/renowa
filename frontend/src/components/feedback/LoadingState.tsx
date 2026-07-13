export default function LoadingState() {
  return (
    <div
      className='space-y-4 py-1'
      role='status'
      aria-live='polite'
      aria-label='Carregando conteúdo'
    >
      <div className='h-8 w-48 animate-pulse rounded-md bg-slate-200' />
      <div className='h-4 w-72 max-w-full animate-pulse rounded bg-slate-200' />
      <div className='mt-6 h-48 animate-pulse rounded-lg bg-white shadow-sm' />
      <span className='sr-only'>Carregando...</span>
    </div>
  );
}
