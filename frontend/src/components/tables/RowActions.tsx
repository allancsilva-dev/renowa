import type { LucideIcon } from 'lucide-react';

interface RowActionProps {
  icon: LucideIcon;
  /** Texto acessível e tooltip. Descreva a linha: `Editar ACME LTDA`. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Ação destrutiva — realce vermelho no hover. */
  danger?: boolean;
}

/**
 * Botão-ícone de linha de tabela.
 *
 * Sem texto visível, o `aria-label` é a única identificação da ação: ele
 * precisa nomear o registro, senão o leitor de tela anuncia dez "Editar"
 * idênticos. O `title` dá a mesma informação a quem enxerga.
 */
export function RowAction({ icon: Icon, label, onClick, disabled, danger }: RowActionProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        danger ? 'hover:bg-red-50 hover:text-red-700' : 'hover:bg-slate-100'
      }`}
    >
      <Icon className='h-4 w-4' aria-hidden='true' />
    </button>
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  return <div className='flex items-center gap-1'>{children}</div>;
}

export default RowActions;
