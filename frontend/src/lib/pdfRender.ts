export const PDF_RENDER_TIMEOUT_MS = 60_000;

export class PdfRenderTimeoutError extends Error {
  constructor() {
    super('A geração do PDF demorou mais de um minuto. Feche outras abas e tente novamente.');
    this.name = 'PdfRenderTimeoutError';
  }
}

/** Impede que uma falha interna do renderer deixe a aba provisória aberta para sempre. */
export async function renderPdfBlobWithTimeout(
  render: () => Promise<Blob>,
  timeoutMs = PDF_RENDER_TIMEOUT_MS,
): Promise<Blob> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new PdfRenderTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([render(), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
