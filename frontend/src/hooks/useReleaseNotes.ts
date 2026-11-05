import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/apiClient';
import { RELEASE_NOTES, pendingReleases, type ReleaseNote } from '@/lib/releaseNotes';

interface ReleaseNotesState {
  supported: boolean;
  seenVersion: string | null;
  createdAt: string | null;
}

/**
 * Decide se o modal de Novidades abre neste acesso e grava quando o usuário
 * o fecha. Falha de rede nunca bloqueia a tela: GET com erro → não abre;
 * PATCH com erro → fecha mesmo assim e o modal volta no próximo acesso.
 */
export function useReleaseNotes(notes: ReleaseNote[] = RELEASE_NOTES) {
  const [pending, setPending] = useState<ReleaseNote[]>([]);
  const dismissed = useRef(false);

  useEffect(() => {
    if (notes.length === 0) return undefined;
    const controller = new AbortController();
    apiClient
      .get<{ data: ReleaseNotesState }>('/users/me/release-notes', { signal: controller.signal })
      .then(({ data }) => {
        const state = data?.data;
        if (!state?.supported || dismissed.current) return;
        setPending(pendingReleases(state.seenVersion, state.createdAt, notes));
      })
      .catch(() => { /* sem estado confiável, não abre */ });
    return () => controller.abort();
  }, [notes]);

  const dismiss = useCallback(() => {
    // `Dialog` chama onClose também no evento nativo `close`; grava uma vez só.
    if (dismissed.current) return;
    dismissed.current = true;
    setPending([]);
    const latest = notes[0];
    if (!latest) return;
    apiClient
      .patch('/users/me/release-notes', { version: latest.version })
      .catch((error: unknown) => console.warn('Falha ao registrar novidades vistas', error));
  }, [notes]);

  return { pending, dismiss };
}
