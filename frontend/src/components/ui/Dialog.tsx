import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function Dialog({ open, title, onClose, children, className = 'max-w-lg' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className={`m-auto w-[calc(100%_-_2rem)] rounded-xl bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/50 ${className}`}
    >
      <div className='max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-6'>
        <header className='mb-5 flex items-center justify-between gap-4'>
          <h2 id={titleId} className='text-lg font-semibold text-slate-900'>{title}</h2>
          <button type='button' onClick={onClose} aria-label='Fechar diálogo' className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'>
            <X className='h-5 w-5' aria-hidden='true' />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
