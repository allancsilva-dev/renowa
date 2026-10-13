import { useCallback, useEffect, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { fetchOrder } from '@/services/orders.service';
import { OrderValidationPdf } from '@/components/orders/OrderValidationPdf';
import { FotosDoPapelIndisponiveisError, fetchFotosPorProduto } from '@/services/productPhotos.service';
import { PdfRenderTimeoutError, renderPdfBlobWithTimeout } from '@/lib/pdfRender';
import { getApiErrorMessage } from '@/lib/errors';
import type { Order } from '@/types';

const POPUP_BLOQUEADO = 'O PDF foi baixado, mas a prévia não pôde ser aberta. Libere popups para este site e tente novamente.';

/**
 * Papel do pedido (PDF) a partir de qualquer tela: Pedido, Faturamento e
 * detalhe do Faturamento usam o mesmo fluxo, para não divergirem em nome de
 * arquivo, fotos ou tratamento de popup.
 *
 * - A aba de prévia abre dentro do gesto do clique: depois de um `await` o
 *   bloqueador de popup a mataria.
 * - Um PDF por vez: clique repetido enquanto gera é ignorado.
 * - A blob URL é revogada depois de um minuto (tempo da prévia carregar).
 * - Desmontar a tela no meio não grava estado em componente morto.
 */
export function useOrderPdf(options: { onLoaded?: (order: Order) => void } = {}) {
  const [loadingUuid, setLoadingUuid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const onLoadedRef = useRef(options.onLoaded);
  onLoadedRef.current = options.onLoaded;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const generate = useCallback(async (uuid: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const previewWindow = window.open('', '_blank');
    previewWindow?.document.write(
      '<title>Gerando papel do pedido…</title>'
      + '<p style="font:14px system-ui;padding:24px;color:#334155">Gerando o papel do pedido…</p>',
    );
    setLoadingUuid(uuid);
    setError(null);
    setWarning(null);
    try {
      const persisted = await fetchOrder(uuid);
      if (mountedRef.current) onLoadedRef.current?.(persisted);
      // Fotos embutidas como data URL: o endpoint de conteúdo é autenticado e o
      // PDF é montado no cliente, então uma URL não resolveria. Indexadas pelo
      // uuid do item — duas linhas do mesmo produto podem ter fotos diferentes.
      const fotosPorProduto = await fetchFotosPorProduto(uuid, persisted.itens ?? []);
      const blob = await renderPdfBlobWithTimeout(() =>
        pdf(<OrderValidationPdf order={persisted} fotosPorProduto={fotosPorProduto} />).toBlob());
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.href = url;
      const filePrefix = persisted.status === 'em_aberto' || persisted.status === 'liberado' ? 'pedido-validacao-renowa' : 'pedido-renowa';
      const link = document.createElement('a');
      link.href = url;
      link.download = `${filePrefix}-${persisted.numero_pedido ?? persisted.uuid}.pdf`;
      link.click();
      if (!previewWindow && mountedRef.current) setWarning(POPUP_BLOQUEADO);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      previewWindow?.close();
      // A falta de foto já vem com o texto pronto, contando quantas faltaram —
      // `getApiErrorMessage` a reduziria a "Erro inesperado".
      if (mountedRef.current) {
        setError(
          err instanceof FotosDoPapelIndisponiveisError || err instanceof PdfRenderTimeoutError
            ? err.message
            : getApiErrorMessage(err),
        );
      }
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setLoadingUuid(null);
    }
  }, []);

  return { generate, loadingUuid, error, warning };
}
