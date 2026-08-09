import { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { ProductPhoto } from '@/types';
import { getApiErrorMessage } from '@/lib/errors';
import {
  deleteProductPhoto,
  fetchProductPhoto,
  fetchProductPhotoDataUrl,
  uploadProductPhoto,
} from '@/services/productPhotos.service';

type LoadedProductPhoto = { meta: ProductPhoto | null; dataUrl: string | null };

/**
 * O Strict Mode monta, desmonta e remonta efeitos em desenvolvimento. Manter a
 * requisição em andamento fora do componente permite que a segunda montagem
 * reutilize o mesmo resultado, sem duplicar o download nem perder o preview.
 */
const photoLoads = new Map<string, Promise<LoadedProductPhoto>>();

function loadProductPhoto(produtoUuid: string): Promise<LoadedProductPhoto> {
  const current = photoLoads.get(produtoUuid);
  if (current) return current;

  const request = fetchProductPhoto(produtoUuid).then(async (meta) => ({
    meta,
    dataUrl: meta ? await fetchProductPhotoDataUrl(produtoUuid) : null,
  }));
  photoLoads.set(produtoUuid, request);

  const clear = () => {
    if (photoLoads.get(produtoUuid) === request) photoLoads.delete(produtoUuid);
  };
  void request.then(clear, clear);
  return request;
}

/**
 * Foto do produto: uma só, que vai na linha do item no papel de todo pedido
 * que use este produto.
 *
 * Na CRIAÇÃO o produto ainda não existe, então o arquivo fica em memória e o
 * formulário sobe depois do POST — enviar antes criaria foto órfã se o save
 * falhasse. Na EDIÇÃO cada ação fala direto com a API.
 */
export default function ProductPhotoField({
  produtoUuid,
  editable,
  onPendingChange,
}: {
  produtoUuid?: string;
  editable: boolean;
  onPendingChange?: (file: File | null) => void;
}) {
  const [photo, setPhoto] = useState<ProductPhoto | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!produtoUuid) return;
    let ativo = true;
    setPhoto(null);
    setPreview(null);
    setErro(null);
    loadProductPhoto(produtoUuid)
      .then(({ meta, dataUrl }) => {
        if (!ativo) return;
        setPhoto(meta);
        setPreview(dataUrl);
      })
      .catch(() => { if (ativo) setErro('Não foi possível carregar a foto.'); });
    return () => { ativo = false; };
  }, [produtoUuid]);

  async function escolher(file: File) {
    setErro(null);
    // Produto ainda não salvo: segura o arquivo e mostra o preview local.
    if (!produtoUuid) {
      setPending(file);
      onPendingChange?.(file);
      setPreview(URL.createObjectURL(file));
      return;
    }
    setBusy(true);
    try {
      const meta = await uploadProductPhoto(produtoUuid, file);
      setPhoto(meta);
      setPreview(await fetchProductPhotoDataUrl(produtoUuid));
    } catch (reason) {
      setErro(getApiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function remover() {
    setErro(null);
    if (!produtoUuid || !photo) {
      setPending(null);
      onPendingChange?.(null);
      setPreview(null);
      return;
    }
    setBusy(true);
    try {
      await deleteProductPhoto(produtoUuid, photo.version);
      setPhoto(null);
      setPreview(null);
    } catch (reason) {
      setErro(getApiErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const temFoto = preview !== null || pending !== null;

  return (
    <div className='flex flex-col gap-1'>
      <span className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Foto</span>
      <p className='text-xs text-slate-500'>
        Aparece na linha deste produto no papel de todo pedido que o usar. Uma foto por produto.
      </p>
      {erro && (
        <p role='alert' className='rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700'>
          {erro}
        </p>
      )}
      <div className='mt-1 flex items-center gap-3'>
        <div className='flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50'>
          {preview
            ? <img src={preview} alt='Foto do produto' className='h-full w-full object-contain' />
            : <span className='px-2 text-center text-xs text-slate-400'>Sem foto</span>}
        </div>
        {editable && (
          <div className='flex flex-col gap-2'>
            <label className='flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50'>
              <ImagePlus className='h-4 w-4' />
              {temFoto ? 'Trocar foto' : 'Escolher foto'}
              <input
                type='file'
                accept='image/jpeg,image/png,image/webp'
                className='hidden'
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void escolher(file);
                }}
              />
            </label>
            {temFoto && (
              <button
                type='button'
                onClick={() => void remover()}
                disabled={busy}
                className='flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-60'
              >
                <Trash2 className='h-4 w-4' />
                Remover
              </button>
            )}
          </div>
        )}
      </div>
      {editable && (
        <div
          role='status'
          className='mt-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800'
        >
          Use só a imagem do produto. <strong>Não suba nota fiscal, documento ou
          qualquer foto com dado de cliente</strong> — a foto do catálogo é
          compartilhada por todos os pedidos que usam este produto e, por não
          pertencer a nenhum cliente, não é alcançada por uma solicitação de
          exclusão de dados (LGPD).
        </div>
      )}
    </div>
  );
}
