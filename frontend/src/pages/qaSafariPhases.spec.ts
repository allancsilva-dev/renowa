// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('driver Safari — captura temporária de window.open', () => {
  afterEach(() => vi.restoreAllMocks());

  it('restaura window.open e zera os popups entre p8 e p8b', async () => {
    const pdfRaw = `%PDF-1.7 /Type /PageX /Subtype /Image ${'x'.repeat(5000)}`;
    const pdfBlob = new Blob([pdfRaw], { type: 'application/pdf' });
    const openOriginal = vi.fn(() => null);
    window.open = openOriginal;
    window.Response = globalThis.Response;
    URL.createObjectURL = vi.fn(() => 'blob:qa-pdf');

    const button = {
      disabled: false,
      click: () => {
        URL.createObjectURL(pdfBlob);
        window.open('', '_blank');
      },
    };
    const qa = {
      st: { ids: {} }, phases: {}, sleep: vi.fn(), go: vi.fn(), ok: vi.fn(() => true),
      note: vi.fn(), api: vi.fn(), all: vi.fn(() => []), fillComplete: vi.fn(),
      btnByText: vi.fn(() => button), settle: vi.fn(), STAMP: 'QA000001',
      screenErrors: vi.fn(() => ''), bodyText: vi.fn(() => ''), flush: vi.fn(),
      waitFor: vi.fn(async (predicate: () => unknown) => predicate()),
    };
    (window as unknown as { QA: typeof qa }).QA = qa;
    const source = readFileSync(resolve(process.cwd(), '../ops/qa-safari/phases.js'), 'utf8');
    window.eval(source);
    const gerarPdf = (qa as unknown as { gerarPdf: (nome: string) => Promise<unknown> }).gerarPdf;

    await gerarPdf('pedido');
    expect(window.open).toBe(openOriginal);
    expect((window as unknown as { __QA_POPUPS: unknown[] }).__QA_POPUPS).toHaveLength(1);

    await gerarPdf('pedido liberado');
    expect(window.open).toBe(openOriginal);
    expect((window as unknown as { __QA_POPUPS: unknown[] }).__QA_POPUPS).toHaveLength(1);
  });
});
