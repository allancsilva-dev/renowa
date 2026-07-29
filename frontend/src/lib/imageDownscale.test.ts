// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from 'vitest';
import { MAX_IMAGE_DIMENSION, downscaleImage } from './imageDownscale';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fakeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

/** `createImageBitmap` e `canvas.toBlob` não existem no jsdom — stub explícito. */
function stubBitmap(width: number, height: number) {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  return close;
}

function stubCanvas(drawImage = vi.fn(), toBlobResult: Blob | null = new Blob(['x'], { type: 'image/jpeg' })) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({ drawImage }),
    toBlob: vi.fn((cb: BlobCallback) => cb(toBlobResult)),
  };
  vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement);
  return canvas;
}

describe('downscaleImage', () => {
  it('não toca em arquivo que não é imagem', async () => {
    const file = fakeFile('planilha.csv', 'text/csv');
    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it('reduz o maior lado para o teto e mantém a proporção', async () => {
    stubBitmap(4000, 3000);
    const canvas = stubCanvas();

    await downscaleImage(fakeFile('foto.png', 'image/png'));

    expect(canvas.width).toBe(MAX_IMAGE_DIMENSION);
    expect(canvas.height).toBe(Math.round(3000 * (MAX_IMAGE_DIMENSION / 4000)));
  });

  it('não amplia imagem já menor que o teto', async () => {
    stubBitmap(800, 600);
    const canvas = stubCanvas();

    await downscaleImage(fakeFile('foto.jpg', 'image/jpeg'));

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  // O nome é o que o servidor usa para vincular a foto ao item pelo código.
  it('preserva o nome base e troca só a extensão', async () => {
    stubBitmap(200, 200);
    stubCanvas();

    const result = await downscaleImage(fakeFile('ABC-123.png', 'image/png'));

    expect(result.name).toBe('ABC-123.jpg');
    expect(result.type).toBe('image/jpeg');
  });

  it('devolve o original quando o navegador não decodifica a imagem', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('formato exótico')));
    const file = fakeFile('estranha.jpg', 'image/jpeg');

    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it('devolve o original quando o canvas não produz blob', async () => {
    stubBitmap(200, 200);
    stubCanvas(vi.fn(), null);
    const file = fakeFile('foto.jpg', 'image/jpeg');

    await expect(downscaleImage(file)).resolves.toBe(file);
  });

  it('libera o bitmap mesmo quando a recodificação falha', async () => {
    const close = stubBitmap(200, 200);
    stubCanvas(vi.fn(), null);

    await downscaleImage(fakeFile('foto.jpg', 'image/jpeg'));

    expect(close).toHaveBeenCalled();
  });
});
