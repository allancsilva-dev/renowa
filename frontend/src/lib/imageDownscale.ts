/** Maior lado da imagem enviada. Suficiente para leitura de etiqueta/avaria. */
export const MAX_IMAGE_DIMENSION = 1600;

/** Qualidade do JPEG de saída — bom equilíbrio entre nitidez e peso. */
export const JPEG_QUALITY = 0.82;

/**
 * Reduz a imagem antes do upload.
 *
 * Foto de celular hoje sai com 4–12 MB e estoura o teto de 3 MB da API. Aqui
 * ela é redesenhada em no máximo 1600px no maior lado e recodificada em JPEG,
 * caindo tipicamente para 200–400 KB — o que também mantém o banco enxuto,
 * já que o binário é guardado em `bytea`.
 *
 * Se o navegador não conseguir decodificar ou recodificar (canvas indisponível,
 * formato exótico), devolve o arquivo original: a API ainda valida tamanho e
 * magic bytes, então o pior caso é uma rejeição explícita — nunca um upload
 * silenciosamente corrompido.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const maiorLado = Math.max(bitmap.width, bitmap.height);
    const escala = maiorLado > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maiorLado : 1;
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, largura, altura);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) return file;

    // Nome preservado sem a extensão original: é ele que o servidor usa para
    // vincular a foto ao item pelo código, então trocar o nome quebraria o
    // auto-vínculo. Só a extensão acompanha o novo formato.
    const nomeBase = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${nomeBase}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
