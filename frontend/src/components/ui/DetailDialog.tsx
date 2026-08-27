import Dialog from '@/components/ui/Dialog';

export interface DetailField {
  label: string;
  value: React.ReactNode;
}

interface DetailDialogProps {
  title: string;
  fields: DetailField[];
  onClose: () => void;
  /** Ações extras à esquerda do "Fechar" — normalmente um "Editar" sob `<Can>`. */
  footer?: React.ReactNode;
  className?: string;
}

function isEmpty(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Visualização somente-leitura de um registro.
 *
 * Os cadastros simples (cliente, fornecedor, transportadora) não têm tela de
 * detalhe própria — só lista e formulário. Este diálogo cobre o "Ver" sem
 * inventar três rotas novas.
 */
export default function DetailDialog({ title, fields, onClose, footer, className = 'max-w-2xl' }: DetailDialogProps) {
  return (
    <Dialog open title={title} onClose={onClose} className={className}>
      <dl className='grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2'>
        {fields.map((field) => (
          <div key={field.label} className='flex flex-col gap-1'>
            <dt className='text-xs font-semibold uppercase tracking-wide text-slate-500'>{field.label}</dt>
            <dd className='break-words text-sm text-slate-800'>{isEmpty(field.value) ? '—' : field.value}</dd>
          </div>
        ))}
      </dl>

      <div className='mt-6 flex justify-end gap-3 pt-2'>
        {footer}
        <button
          type='button'
          onClick={onClose}
          className='min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
        >
          Fechar
        </button>
      </div>
    </Dialog>
  );
}
