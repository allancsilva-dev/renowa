import { Sparkles } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { RELEASE_ITEM_LABEL, type ReleaseItemTipo, type ReleaseNote } from '@/lib/releaseNotes';

const TIPO_ORDEM: ReleaseItemTipo[] = ['novo', 'melhoria', 'correcao'];

const TIPO_CLASSE: Record<ReleaseItemTipo, string> = {
  novo: 'bg-primary-50 text-primary-700 ring-primary-200',
  melhoria: 'bg-sky-50 text-sky-800 ring-sky-200',
  correcao: 'bg-amber-50 text-amber-800 ring-amber-200',
};

const dataPorExtenso = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});

function formatarData(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : dataPorExtenso.format(parsed);
}

interface ReleaseNotesDialogProps {
  open: boolean;
  notes: ReleaseNote[];
  onClose: () => void;
}

export default function ReleaseNotesDialog({ open, notes, onClose }: ReleaseNotesDialogProps) {
  if (notes.length === 0) return null;

  return (
    <Dialog open={open} title='O que há de novo' onClose={onClose} className='max-w-xl'>
      <div data-release-notes className='space-y-6'>
        {notes.map((note) => (
          <section key={note.version} aria-label={`Atualização de ${formatarData(note.date)}`}>
            <p className='mb-3 flex items-center gap-2 text-sm text-slate-600'>
              <Sparkles className='h-4 w-4 text-primary' aria-hidden='true' />
              Atualização de {formatarData(note.date)}
            </p>
            <ul className='space-y-3'>
              {[...note.items]
                .sort((a, b) => TIPO_ORDEM.indexOf(a.tipo) - TIPO_ORDEM.indexOf(b.tipo))
                .map((item) => (
                  <li key={`${item.tipo}-${item.texto}`} className='flex items-start gap-3'>
                    <span className={`mt-0.5 inline-flex w-[5.5rem] shrink-0 justify-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TIPO_CLASSE[item.tipo]}`}>
                      {RELEASE_ITEM_LABEL[item.tipo]}
                    </span>
                    <span className='text-[0.9375rem] leading-relaxed text-slate-800'>{item.texto}</span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
        <div className='flex justify-end border-t border-slate-100 pt-4'>
          <button
            type='button'
            onClick={onClose}
            autoFocus
            className='inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          >
            Entendi
          </button>
        </div>
      </div>
    </Dialog>
  );
}
