// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// O CSP vive no arquivo incluído pelo nginx.conf; validar o include diretamente
// evita falso negativo quando os cabeçalhos são compartilhados entre locations.
// Comentários fora: um comentário que cite uma diretiva casaria antes da
// diretiva real e o teste passaria a validar o texto explicativo.
const nginxConfig = readFileSync(new URL('../security-headers.conf', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('#'))
  .join('\n');

describe('Content-Security-Policy do frontend', () => {
  const sources = (directive: string) =>
    nginxConfig.match(new RegExp(`${directive} ([^;]+);`))?.[1].split(/\s+/);

  it('permite os recursos locais exigidos pelo gerador de PDF sem liberar eval', () => {
    const scriptSrc = sources('script-src');
    const connectSrc = sources('connect-src');
    const workerSrc = sources('worker-src');

    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(connectSrc).toContain('data:');
    expect(workerSrc).toEqual(["'self'", 'blob:']);
  });

  // O preview de foto (ProductPhotoField, OrderItemPhotoField) monta a imagem a
  // partir de `URL.createObjectURL(file)` antes de salvar; a foto já persistida
  // volta como data URL. Faltando qualquer um dos dois, a imagem quebra só em
  // produção — o `vite dev` não emite CSP.
  it('permite as fontes de imagem usadas pelo preview de foto', () => {
    const imgSrc = sources('img-src');

    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain('data:');
    expect(imgSrc).toContain('blob:');
  });
});
