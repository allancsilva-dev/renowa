import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { MAX_PHOTO_SIZE_BYTES, detectImageMimeType, validateImageUpload } from './image-validation';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from([0x00]),
]);

function fileFrom(buffer: Buffer, originalname = 'foto.jpg'): Express.Multer.File {
  return { buffer, originalname, size: buffer.length } as Express.Multer.File;
}

/**
 * Casos herdados do serviço de fotos do pedido (removido na 0040). A validação
 * mudou de lugar, não de responsabilidade: é ela que impede um arquivo
 * executável de ser servido inline pelo domínio da app.
 */
describe('detectImageMimeType', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WEBP', WEBP, 'image/webp'],
  ])('reconhece %s pelo conteúdo', (_nome, buffer, esperado) => {
    expect(detectImageMimeType(buffer)).toBe(esperado);
  });

  // O `mimetype` do multipart é escolhido pelo cliente: um `.php` renomeado
  // chega declarando `image/jpeg`. Só o conteúdo decide.
  it('recusa arquivo que não é imagem, mesmo com nome e mimetype de imagem', () => {
    const php = Buffer.from('<?php system($_GET["c"]); ?>', 'utf8');

    expect(() => detectImageMimeType(php)).toThrow(BadRequestException);
  });

  // SVG é XML executável: servi-lo inline é XSS no domínio da app.
  it('recusa SVG', () => {
    expect(() => detectImageMimeType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8')))
      .toThrow(BadRequestException);
  });

  // Buffer curto não pode estourar índice antes de chegar à recusa.
  it('recusa buffer curto sem quebrar', () => {
    expect(() => detectImageMimeType(Buffer.from([0xff, 0xd8]))).toThrow(BadRequestException);
  });
});

describe('validateImageUpload', () => {
  it('devolve buffer e mime do arquivo válido', () => {
    expect(validateImageUpload(fileFrom(PNG, 'x.png'))).toEqual({ buffer: PNG, mimeType: 'image/png' });
  });

  it('recusa arquivo ausente', () => {
    expect(() => validateImageUpload(undefined)).toThrow(BadRequestException);
  });

  it('recusa arquivo vazio', () => {
    expect(() => validateImageUpload(fileFrom(Buffer.alloc(0)))).toThrow(BadRequestException);
  });

  // O teto tem que bater com o CHECK `produto_fotos_tamanho_bytes_check`: no
  // limite passa, um byte acima não.
  it('aceita exatamente o limite e recusa um byte acima', () => {
    const noLimite = { buffer: JPEG, originalname: 'x.jpg', size: MAX_PHOTO_SIZE_BYTES } as Express.Multer.File;
    const acima = { ...noLimite, size: MAX_PHOTO_SIZE_BYTES + 1 } as Express.Multer.File;

    expect(validateImageUpload(noLimite).mimeType).toBe('image/jpeg');
    expect(() => validateImageUpload(acima)).toThrow(BadRequestException);
  });
});
