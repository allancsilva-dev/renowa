// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nginxConfig = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');

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
});
