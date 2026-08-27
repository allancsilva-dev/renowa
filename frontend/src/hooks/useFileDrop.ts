import { useCallback, useRef, useState } from 'react';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

interface UseFileDropOptions {
  disabled?: boolean;
  /** MIME types aceitos. O `accept` do `<input>` NÃO vale para drop. */
  accept?: readonly string[];
  rejectMessage?: string;
}

/**
 * Arrastar-e-soltar um arquivo sobre uma área da tela.
 *
 * O `accept` de um `<input type='file'>` filtra o seletor do sistema, mas o
 * navegador entrega no drop qualquer coisa que o usuário arrastar — por isso a
 * validação de tipo acontece aqui, e não é opcional.
 */
export function useFileDrop(onFile: (file: File) => void, options: UseFileDropOptions = {}) {
  const { disabled = false, accept, rejectMessage = 'Formato de arquivo não aceito.' } = options;
  const [isOver, setIsOver] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  // Entrar num elemento filho dispara dragleave no pai: sem contador, o
  // destaque pisca enquanto o cursor atravessa a zona.
  const depth = useRef(0);

  const onDragEnter = useCallback((event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    depth.current += 1;
    setIsOver(true);
  }, [disabled]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    if (disabled) return;
    // Sem isto o navegador abre o arquivo e descarta o formulário.
    event.preventDefault();
  }, [disabled]);

  const onDragLeave = useCallback((event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsOver(false);
  }, [disabled]);

  const onDrop = useCallback((event: React.DragEvent) => {
    if (disabled) return;
    event.preventDefault();
    depth.current = 0;
    setIsOver(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (accept && !accept.includes(file.type)) {
      setRejection(rejectMessage);
      return;
    }
    setRejection(null);
    onFile(file);
  }, [accept, disabled, onFile, rejectMessage]);

  return {
    isOver,
    rejection,
    clearRejection: useCallback(() => setRejection(null), []),
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
