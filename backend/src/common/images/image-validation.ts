import { BadRequestException } from '@nestjs/common';

/**
 * Validação de upload de imagem, compartilhada por quem quer que aceite foto.
 *
 * Nasceu dentro do serviço de fotos do pedido (0034) e ficou aqui quando a foto
 * migrou para o catálogo de produto: a whitelist por magic bytes é a única coisa
 * entre um `.php` renomeado para `.jpg` e um XSS servido pelo domínio da app,
 * então ela não pode ser reescrita por quem for adicionar o próximo upload.
 */

/** Teto por foto. Espelha os CHECKs `*_tamanho_bytes_check` no banco. */
export const MAX_PHOTO_SIZE_BYTES = 3 * 1024 * 1024;

/**
 * Assinaturas de arquivo (magic bytes) dos formatos aceitos.
 *
 * O `mimetype` do multipart é escolhido pelo cliente e não prova nada: um
 * `.php` renomeado para `.jpg` chega como `image/jpeg`. Só o conteúdo decide.
 *
 * SVG fica de fora de propósito: é XML executável e servi-lo inline é XSS.
 */
const MAGIC_BYTES: Array<{ mime: string; matches: (buffer: Buffer) => boolean }> = [
  { mime: 'image/jpeg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    matches: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** MIME real do conteúdo, ou 400 se não for uma das imagens aceitas. */
export function detectImageMimeType(buffer: Buffer): string {
  const detected = MAGIC_BYTES.find((entry) => entry.matches(buffer));
  if (!detected) {
    throw new BadRequestException('Arquivo não é uma imagem JPEG, PNG ou WEBP válida.');
  }
  return detected.mime;
}

/**
 * Confere presença e tamanho e devolve o MIME real.
 *
 * O `FileInterceptor` já corta acima do teto, mas ele responde com erro genérico
 * de multer; a checagem aqui é o que produz a mensagem em português — e cobre
 * quem chamar o serviço sem passar pelo interceptor.
 */
export function validateImageUpload(file: Express.Multer.File | undefined): { buffer: Buffer; mimeType: string } {
  if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo de imagem no campo `arquivo`.');
  if (file.size > MAX_PHOTO_SIZE_BYTES) throw new BadRequestException('Imagem maior que 3 MB.');
  return { buffer: file.buffer, mimeType: detectImageMimeType(file.buffer) };
}
