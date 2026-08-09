import { describe, expect, it } from 'vitest';
import { orderValidationPdfStyles } from './OrderValidationPdf';

describe('OrderValidationPdf — pesos das colunas', () => {
  it('destaca QTD TOTAL e VLR. COM DESC., mantendo DESC.% normal', () => {
    expect(orderValidationPdfStyles.colQtdTotal.fontFamily).toBe('Helvetica-Bold');
    expect(orderValidationPdfStyles.colVlrComDesc.fontFamily).toBe('Helvetica-Bold');
    expect(orderValidationPdfStyles.colDescPerc).not.toHaveProperty('fontFamily');
  });
});
