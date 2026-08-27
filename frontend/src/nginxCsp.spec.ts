// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nginxConfig = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8');

describe('Content-Security-Policy do frontend', () => {
  it('permite somente a compilação WebAssembly exigida pelo gerador de PDF', () => {
    const scriptSrc = nginxConfig.match(/script-src ([^;]+);/)?.[1].split(/\s+/);

    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });
});
