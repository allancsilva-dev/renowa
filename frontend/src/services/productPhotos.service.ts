import api from '@/lib/apiClient';
import type { ApiResponse, OrderItem, ProductPhoto } from '@/types';
import { downscaleImage } from '@/lib/imageDownscale';
import { mapComLimite } from '@/lib/promisePool';

/**
 * Grava a foto do produto, substituindo a anterior. A imagem é reduzida antes
 * de subir (ver `downscaleImage`): foto de celular estoura o teto de 3 MB.
 *
 * `PUT` porque a operação é idempotente por produto — subir de novo troca, não
 * acumula. Um produto tem uma foto só.
 */
export async function uploadProductPhoto(produtoUuid: string, file: File): Promise<ProductPhoto> {
  const reduzida = await downscaleImage(file);
  const formData = new FormData();
  formData.append('arquivo', reduzida);
  const { data } = await api.put<ApiResponse<ProductPhoto>>(`/produtos/${produtoUuid}/foto`, formData);
  return data.data;
}

/** Metadados da foto atual, ou `null` — produto sem foto é o estado normal. */
export async function fetchProductPhoto(produtoUuid: string): Promise<ProductPhoto | null> {
  const { data } = await api.get<ApiResponse<ProductPhoto | null>>(`/produtos/${produtoUuid}/foto`);
  return data.data;
}

/**
 * Baixa os bytes e devolve um data URL.
 *
 * O endpoint é autenticado, então a imagem não pode ser referenciada por
 * `<img src="/api/...">` direto — nem no PDF, que é montado no cliente pelo
 * `@react-pdf/renderer` e precisa dos bytes embutidos.
 */
async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function fetchProductPhotoDataUrl(produtoUuid: string): Promise<string> {
  const { data } = await api.getBlob(`/produtos/${produtoUuid}/foto/conteudo`);
  return toDataUrl(data);
}

/**
 * Mesma imagem, outra porta: esta rota exige `pedidos.ver` em vez de
 * `produtos.ver`.
 *
 * É por ela que o papel do pedido baixa as fotos: quem confere pedido sem acesso
 * ao catálogo emitiria o papel sem foto nenhuma se dependesse da rota de produto.
 */
export async function fetchOrderItemPhotoDataUrl(
  orderUuid: string,
  itemUuid: string,
): Promise<string> {
  const { data } = await api.getBlob(`/pedidos/${orderUuid}/itens/${itemUuid}/foto`);
  return toDataUrl(data);
}

/** Downloads simultâneos do papel. Ver `mapComLimite`. */
const LIMITE_DE_DOWNLOADS = 6;

/** Uma tentativa mais duas — depois disso a espera não está resolvendo. */
const TENTATIVAS = 3;

const ESPERA_ENTRE_TENTATIVAS_MS = [800, 2400];

/**
 * O papel não pôde ser montado porque faltou foto que deveria existir.
 *
 * Existe para separar "produto sem foto" (normal, 404) de "não consegui
 * baixar" (429, 5xx, rede). A segunda não pode virar célula vazia em silêncio:
 * quem confere a mercadoria compara com a imagem, e uma linha sem foto parece
 * produto sem cadastro de foto.
 */
export class FotosDoPapelIndisponiveisError extends Error {
  constructor(readonly faltando: number) {
    super(
      `Não foi possível baixar ${faltando} foto(s) do pedido. `
      + 'O papel não foi emitido para não sair incompleto — tente de novo em alguns segundos.',
    );
    this.name = 'FotosDoPapelIndisponiveisError';
  }
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusDoErro(erro: unknown): number | undefined {
  return (erro as { response?: { status?: number } })?.response?.status;
}

/**
 * Vale insistir? 429 e 5xx passam; rede caída e timeout (que chegam sem status)
 * também. 403 não: permissão não melhora com espera.
 */
function vaiMelhorarComEspera(erro: unknown): boolean {
  const status = statusDoErro(erro);
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

/**
 * Baixa a foto resolvida de cada item para o papel do pedido.
 *
 * Antes isto era um `Promise.all` sem teto com `.catch(() => null)` em cada
 * download: pedido grande disparava uma requisição por produto de uma vez,
 * tomava 429 do teto da rota em diante, e o papel saía com fotos faltando sem
 * avisar ninguém. Agora a fila tem teto, falha transitória tem retry, e o que
 * sobrar de falha aborta a emissão.
 *
 * A rota do item prefere a foto específica do pedido e usa a foto do catálogo
 * como fallback. Por isso o resultado é indexado pelo uuid do item, não pelo
 * produto: duas linhas do mesmo produto podem ter imagens diferentes.
 */
export async function fetchFotosPorProduto(
  orderUuid: string,
  itens: OrderItem[],
): Promise<Record<string, string>> {
  const entradas = await mapComLimite(itens, LIMITE_DE_DOWNLOADS, async (item) => {
    for (let tentativa = 0; ; tentativa += 1) {
      try {
        return [item.uuid, await fetchOrderItemPhotoDataUrl(orderUuid, item.uuid)] as const;
      } catch (err) {
        // Produto sem foto é o estado normal do catálogo, não uma falha.
        if (statusDoErro(err) === 404) return [item.uuid, null] as const;
        if (tentativa >= TENTATIVAS - 1 || !vaiMelhorarComEspera(err)) {
          return [item.uuid, undefined] as const;
        }
        await espera(ESPERA_ENTRE_TENTATIVAS_MS[tentativa]);
      }
    }
  });

  const faltando = entradas.filter(([, dataUrl]) => dataUrl === undefined).length;
  if (faltando > 0) throw new FotosDoPapelIndisponiveisError(faltando);

  return Object.fromEntries(
    entradas.filter((entrada): entrada is readonly [string, string] => typeof entrada[1] === 'string'),
  );
}

export async function fetchOrderItemPhoto(orderUuid: string, itemUuid: string): Promise<ProductPhoto | null> {
  const { data } = await api.get<ApiResponse<ProductPhoto | null>>(`/pedidos/${orderUuid}/itens/${itemUuid}/foto/metadados`);
  return data.data;
}

export async function uploadOrderItemPhoto(orderUuid: string, itemUuid: string, file: File): Promise<ProductPhoto> {
  const reduzida = await downscaleImage(file);
  const formData = new FormData(); formData.append('arquivo', reduzida);
  const { data } = await api.put<ApiResponse<ProductPhoto>>(`/pedidos/${orderUuid}/itens/${itemUuid}/foto`, formData);
  return data.data;
}

export async function deleteOrderItemPhoto(orderUuid: string, itemUuid: string, version: number): Promise<void> {
  await api.delete(`/pedidos/${orderUuid}/itens/${itemUuid}/foto`, { params: { version } });
}

export async function deleteProductPhoto(produtoUuid: string, version: number): Promise<void> {
  await api.delete(`/produtos/${produtoUuid}/foto`, { params: { version } });
}
