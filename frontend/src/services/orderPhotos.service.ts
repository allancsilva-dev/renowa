import api from '@/lib/apiClient';
import type { ApiResponse, OrderPhoto } from '@/types';
import { downscaleImage } from '@/lib/imageDownscale';

/**
 * Envia uma foto do pedido. A imagem é reduzida antes de subir (ver
 * `downscaleImage`): foto de celular estoura o teto de 3 MB da API.
 *
 * O nome do arquivo é o que o servidor usa para vincular a foto ao item pelo
 * código — por isso ele é preservado no downscale.
 */
export async function uploadOrderPhoto(
  orderUuid: string,
  file: File,
  itemUuid?: string,
): Promise<OrderPhoto> {
  const reduzida = await downscaleImage(file);
  const formData = new FormData();
  formData.append('arquivo', reduzida);
  if (itemUuid) formData.append('item_uuid', itemUuid);
  const { data } = await api.post<ApiResponse<OrderPhoto>>(`/pedidos/${orderUuid}/fotos`, formData);
  return data.data;
}

export async function fetchOrderPhotos(orderUuid: string): Promise<OrderPhoto[]> {
  const { data } = await api.get<ApiResponse<OrderPhoto[]>>(`/pedidos/${orderUuid}/fotos`);
  return data.data;
}

/**
 * Baixa os bytes e devolve um data URL.
 *
 * O endpoint é autenticado, então a imagem não pode ser referenciada por
 * `<img src="/api/...">` direto — nem no PDF, que é montado no cliente pelo
 * `@react-pdf/renderer` e precisa dos bytes embutidos.
 */
export async function fetchOrderPhotoDataUrl(orderUuid: string, photoUuid: string): Promise<string> {
  const { data } = await api.getBlob(`/pedidos/${orderUuid}/fotos/${photoUuid}/conteudo`);
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(data);
  });
}

export async function deleteOrderPhoto(
  orderUuid: string,
  photoUuid: string,
  version: number,
): Promise<void> {
  await api.delete(`/pedidos/${orderUuid}/fotos/${photoUuid}`, { params: { version } });
}
