import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Link2, Link2Off, Trash2 } from 'lucide-react';
import {
  deleteOrderPhoto, fetchOrderPhotoDataUrl, fetchOrderPhotos, uploadOrderPhoto,
} from '@/services/orderPhotos.service';
import { getApiErrorMessage } from '@/lib/errors';
import type { OrderPhoto } from '@/types';

type Props = {
  orderUuid: string;
  /** Rótulo do item por uuid — mostra a que item cada foto ficou vinculada. */
  itemLabels?: Record<string, string>;
  /** Sem isto o painel fica somente-leitura (pedido liberado ou sem permissão). */
  editable?: boolean;
};

/**
 * Fotos do pedido: upload em lote, miniatura e remoção.
 *
 * O vínculo com o item é automático pelo NOME DO ARQUIVO — nomear a foto com o
 * código do item basta. Quando o nome não bate (ou bate com mais de um item), a
 * foto fica no pedido e a etiqueta "Não vinculada" avisa.
 */
export default function OrderPhotosPanel({ orderUuid, itemLabels = {}, editable = false }: Props) {
  const [photos, setPhotos] = useState<OrderPhoto[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetchOrderPhotos(orderUuid)
      .then(setPhotos)
      .catch((reason) => setError(getApiErrorMessage(reason)))
      .finally(() => setLoading(false));
  }, [orderUuid]);

  useEffect(() => { load(); }, [load]);

  // Miniaturas: o endpoint é autenticado, então a imagem não pode ir direto no
  // `src`. Busca só o que ainda não está em cache local.
  useEffect(() => {
    let active = true;
    const pendentes = photos.filter((photo) => !thumbs[photo.uuid]);
    if (!pendentes.length) return;
    Promise.all(pendentes.map(async (photo) => {
      const dataUrl = await fetchOrderPhotoDataUrl(orderUuid, photo.uuid).catch(() => null);
      return [photo.uuid, dataUrl] as const;
    })).then((entries) => {
      if (!active) return;
      setThumbs((current) => {
        const next = { ...current };
        for (const [uuid, dataUrl] of entries) if (dataUrl) next[uuid] = dataUrl;
        return next;
      });
    });
    return () => { active = false; };
  }, [photos, orderUuid, thumbs]);

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    // Limpa o input para permitir reenviar o mesmo arquivo depois de um erro.
    event.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      // Sequencial de propósito: o teto de fotos por pedido é conferido no
      // servidor, e em paralelo várias requisições passariam pela mesma
      // contagem antes de qualquer uma gravar.
      for (const file of files) {
        await uploadOrderPhoto(orderUuid, file);
      }
      load();
    } catch (reason) {
      setError(getApiErrorMessage(reason));
      load();
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photo: OrderPhoto) {
    setError(null);
    try {
      await deleteOrderPhoto(orderUuid, photo.uuid, photo.version);
      setPhotos((current) => current.filter((entry) => entry.uuid !== photo.uuid));
    } catch (reason) {
      setError(getApiErrorMessage(reason));
    }
  }

  return (
    <section className='rounded-xl border border-slate-100 bg-white p-6 shadow-sm'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-xs font-semibold uppercase tracking-wider text-slate-400'>Fotos</h2>
          <p className='mt-1 text-xs text-slate-600'>
            Nomeie o arquivo com o código do item para vincular automaticamente. As fotos entram no PDF do pedido.
          </p>
        </div>
        {editable && (
          <label className='flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'>
            <ImagePlus className='h-4 w-4' />
            {uploading ? 'Enviando...' : 'Adicionar fotos'}
            <input
              type='file'
              accept='image/jpeg,image/png,image/webp'
              multiple
              disabled={uploading}
              onChange={handleFiles}
              className='hidden'
            />
          </label>
        )}
      </div>

      {error && (
        <div role='alert' className='mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
          {error}
        </div>
      )}

      {loading ? (
        <p className='text-sm text-slate-500'>Carregando fotos...</p>
      ) : photos.length === 0 ? (
        <p className='text-sm text-slate-500'>Nenhuma foto anexada a este pedido.</p>
      ) : (
        <ul className='grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4'>
          {photos.map((photo) => (
            <li key={photo.uuid} className='overflow-hidden rounded-lg border border-slate-200'>
              <div className='flex h-32 items-center justify-center bg-slate-50'>
                {thumbs[photo.uuid] ? (
                  <img src={thumbs[photo.uuid]} alt={photo.nome_arquivo} className='h-full w-full object-cover' />
                ) : (
                  <span className='text-xs text-slate-400'>Carregando...</span>
                )}
              </div>
              <div className='space-y-1 p-2'>
                <p className='truncate text-xs font-medium text-slate-700' title={photo.nome_arquivo}>
                  {photo.nome_arquivo}
                </p>
                <p className={`flex items-center gap-1 text-xs ${photo.vinculado ? 'text-teal-700' : 'text-slate-500'}`}>
                  {photo.vinculado ? <Link2 className='h-3 w-3' /> : <Link2Off className='h-3 w-3' />}
                  {photo.vinculado
                    ? (photo.item_uuid && itemLabels[photo.item_uuid]) || photo.codigo_vinculo || 'Item vinculado'
                    : 'Não vinculada'}
                </p>
                {editable && (
                  <button
                    type='button'
                    onClick={() => handleDelete(photo)}
                    aria-label={`Remover ${photo.nome_arquivo}`}
                    className='flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-slate-600 hover:bg-red-50 hover:text-red-700'
                  >
                    <Trash2 className='h-3 w-3' />
                    Remover
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
