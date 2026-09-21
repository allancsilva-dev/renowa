import { useCallback, useEffect, useState } from 'react';

/**
 * Edição pendente em formulário: compara um snapshot serializado do estado
 * atual com o último estado sabidamente gravado (ou carregado do servidor).
 *
 * O snapshot é responsabilidade de quem chama — ele decide o que é edição do
 * usuário (campos) e o que é estado derivado (preview de foto, status), que não
 * pode marcar o formulário como sujo.
 *
 * Enquanto houver edição pendente, fechar a aba ou recarregar pede
 * confirmação. Navegação interna (links do app) não passa por aqui: o app usa
 * `<BrowserRouter>` e `useBlocker` exige data router.
 */
export function useUnsavedChanges(snapshot: string, enabled = true) {
  const [baseline, setBaseline] = useState(snapshot);
  const isDirty = enabled && snapshot !== baseline;

  /**
   * Registra `saved` como o estado gravado. Recebe o snapshot explícito — e não
   * lê o atual — para continuar estável entre renders e para que o que foi
   * digitado durante um save em andamento continue contando como pendente.
   */
  const markClean = useCallback((saved: string) => setBaseline(saved), []);

  useEffect(() => {
    if (!isDirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome/Edge antigos só mostram o aviso com `returnValue` preenchido.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  return { isDirty, markClean };
}
