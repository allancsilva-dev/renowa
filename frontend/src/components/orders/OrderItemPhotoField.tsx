import { Camera } from 'lucide-react';
import { useFileDrop, IMAGE_MIME_TYPES } from '@/hooks/useFileDrop';

interface OrderItemPhotoFieldProps {
  /** Posição do item na lista, usada só no texto alternativo. */
  index: number;
  fotoPreview: string | null;
  willCopy?: boolean;
  locked: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}

/**
 * Área da foto específica do item do pedido: clique ou arrastar-e-soltar.
 *
 * Componente próprio porque o `useFileDrop` precisa de estado por item — não dá
 * para chamar o hook dentro do `map` dos itens.
 */
export default function OrderItemPhotoField({ index, fotoPreview, willCopy = false, locked, onChoose, onRemove }: OrderItemPhotoFieldProps) {
  const { isOver, rejection, clearRejection, dropProps } = useFileDrop(onChoose, {
    disabled: locked,
    accept: IMAGE_MIME_TYPES,
    rejectMessage: 'Arraste uma imagem JPEG, PNG ou WEBP.',
  });

  return (
    <div className='md:col-span-4'>
      <div
        {...dropProps}
        className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
          isOver ? 'border-dashed border-primary bg-primary/5' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {fotoPreview
          ? <img src={fotoPreview} alt={`Foto específica do item ${index + 1}`} className='h-16 w-20 rounded-md bg-white object-contain' />
          : <div className='flex h-16 w-20 items-center justify-center rounded-md bg-white text-slate-400'><Camera className='h-5 w-5' /></div>}
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-semibold text-slate-800'>{willCopy && !fotoPreview ? 'Foto do pedido original será copiada' : 'Foto deste pedido'}</p>
          <p className='text-xs text-slate-600'>Substitui a foto do produto somente neste pedido. Ao remover, o PDF volta a usar a foto do catálogo.</p>
          {!locked && <p className='text-xs text-slate-500'>Arraste uma imagem para cá ou escolha um arquivo.</p>}
        </div>
        {/*
          `relative` não é decoração: `.sr-only` é `position: absolute`, e sem um
          ancestral posicionado o input resolve contra o initial containing block.
          Aí ele escapa do `overflow-hidden` do AppShell, entra no scrollable
          overflow do `<html>` (um input por item, cada vez mais abaixo) e o scroll
          do `<main>` passa a encadear pro documento: o shell `h-dvh` sobe e deixa
          uma faixa cinza morta no rodapé. Reproduzido no Safari.
        */}
        <label className={`relative cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 ${locked ? 'pointer-events-none opacity-40' : ''}`}>
          {fotoPreview || willCopy ? 'Trocar foto' : 'Escolher foto'}
          <input
            className='sr-only'
            type='file'
            accept='image/jpeg,image/png,image/webp'
            disabled={locked}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Zerar o valor permite reescolher o MESMO arquivo depois de remover.
              event.target.value = '';
              if (!file) return;
              clearRejection();
              onChoose(file);
            }}
          />
        </label>
        {(fotoPreview || willCopy) && (
          <button type='button' disabled={locked} onClick={onRemove} className='rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40'>
            Remover
          </button>
        )}
      </div>
      {rejection && <p role='alert' className='mt-1 text-xs text-red-700'>{rejection}</p>}
    </div>
  );
}
