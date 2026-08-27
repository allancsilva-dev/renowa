import { describe, expect, it, vi } from 'vitest';
import { PdfRenderTimeoutError, renderPdfBlobWithTimeout } from './pdfRender';

describe('renderPdfBlobWithTimeout', () => {
  it('devolve o PDF quando o renderer termina', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });

    await expect(renderPdfBlobWithTimeout(() => Promise.resolve(blob), 10)).resolves.toBe(blob);
  });

  it('interrompe a espera quando o renderer fica pendente', async () => {
    vi.useFakeTimers();
    const result = renderPdfBlobWithTimeout(() => new Promise<Blob>(() => {}), 60_000);
    const rejection = expect(result).rejects.toBeInstanceOf(PdfRenderTimeoutError);

    await vi.advanceTimersByTimeAsync(60_000);
    await rejection;
    vi.useRealTimers();
  });
});
