// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '@/lib/apiClient';
import type { OrderItem } from '@/types';
import { FotosDoPapelIndisponiveisError, fetchFotosPorProduto } from './productPhotos.service';

vi.mock('@/lib/apiClient', () => ({
  default: { getBlob: vi.fn() },
}));

const getBlob = vi.mocked(apiClient.getBlob);

function item(uuid: string, produtoUuid: string): OrderItem {
  return { uuid, produto: { uuid: produtoUuid } } as OrderItem;
}

/** O formato que `apiClient` lança em resposta não-ok. */
const httpError = (status: number) => ({ response: { status, data: null } });

const blobDeFoto = () => ({ data: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }) });

beforeEach(() => {
  // Só `setTimeout`: o backoff é o que precisamos controlar, e falsear o resto
  // trava o `FileReader` do jsdom que converte o blob em data URL.
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  getBlob.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchFotosPorProduto', () => {
  it('indexa por produto e usa a rota do item do pedido', async () => {
    getBlob.mockResolvedValue(blobDeFoto());

    const fotos = await fetchFotosPorProduto('pedido-1', [item('i1', 'p1'), item('i2', 'p2')]);

    expect(Object.keys(fotos)).toEqual(['p1', 'p2']);
    expect(fotos.p1).toMatch(/^data:image\/jpeg;base64,/);
    expect(getBlob).toHaveBeenCalledWith('/pedidos/pedido-1/itens/i1/foto');
  });

  /** Produto sem foto é o estado normal do catálogo — não é falha. */
  it('trata 404 como ausência, sem retry e sem erro', async () => {
    getBlob.mockRejectedValueOnce(httpError(404));
    getBlob.mockResolvedValueOnce(blobDeFoto());

    const fotos = await fetchFotosPorProduto('pedido-1', [item('i1', 'p1'), item('i2', 'p2')]);

    expect(fotos).not.toHaveProperty('p1');
    expect(fotos).toHaveProperty('p2');
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  it('insiste depois de um 429 e aproveita a foto da segunda tentativa', async () => {
    getBlob.mockRejectedValueOnce(httpError(429));
    getBlob.mockResolvedValueOnce(blobDeFoto());

    const promessa = fetchFotosPorProduto('pedido-1', [item('i1', 'p1')]);
    await vi.advanceTimersByTimeAsync(800);

    await expect(promessa).resolves.toHaveProperty('p1');
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  /**
   * O motivo de tudo isto: antes o papel saía sem a foto e ninguém ficava
   * sabendo.
   */
  it('aborta a emissão quando o 429 persiste, contando o que faltou', async () => {
    getBlob.mockRejectedValue(httpError(429));

    const promessa = fetchFotosPorProduto('pedido-1', [item('i1', 'p1'), item('i2', 'p2')]);
    const capturado = promessa.catch((err) => err);
    await vi.advanceTimersByTimeAsync(800 + 2400);

    const erro = await capturado;
    expect(erro).toBeInstanceOf(FotosDoPapelIndisponiveisError);
    expect((erro as FotosDoPapelIndisponiveisError).faltando).toBe(2);
    expect(getBlob).toHaveBeenCalledTimes(6); // 2 fotos × 3 tentativas
  });

  it('falha de imediato no 403 — permissão não melhora com espera', async () => {
    getBlob.mockRejectedValue(httpError(403));

    await expect(fetchFotosPorProduto('pedido-1', [item('i1', 'p1')]))
      .rejects.toBeInstanceOf(FotosDoPapelIndisponiveisError);
    expect(getBlob).toHaveBeenCalledTimes(1);
  });

  it('nunca dispara mais de 6 downloads ao mesmo tempo', async () => {
    let emVoo = 0;
    let pico = 0;
    getBlob.mockImplementation(async () => {
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      await Promise.resolve();
      emVoo -= 1;
      return blobDeFoto();
    });

    const itens = Array.from({ length: 30 }, (_, i) => item(`i${i}`, `p${i}`));
    await fetchFotosPorProduto('pedido-1', itens);

    expect(pico).toBe(6);
  });
});
