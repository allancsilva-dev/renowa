import { describe, expect, it } from 'vitest';
import { orderValidationPdfStyles } from './OrderValidationPdf';

describe('OrderValidationPdf — pesos das colunas', () => {
  it('destaca QTD TOTAL e VLR. COM DESC., mantendo DESC.% normal', () => {
    expect(orderValidationPdfStyles.colQtdTotal.fontFamily).toBe('Helvetica-Bold');
    expect(orderValidationPdfStyles.colVlrComDesc.fontFamily).toBe('Helvetica-Bold');
    expect(orderValidationPdfStyles.colDescPerc).not.toHaveProperty('fontFamily');
  });

  it('imprime o valor com desconto em corpo maior que o resto da linha', () => {
    expect(orderValidationPdfStyles.colVlrComDescValue.fontSize).toBeGreaterThan(
      orderValidationPdfStyles.row.fontSize,
    );
  });

  // O comentário das larguras manda devolver em outra coluna o que uma pegar.
  // Sem este teste, a conta só era conferida na leitura — e estourar 100% empurra
  // a última coluna para fora da página.
  it('mantém as larguras das colunas somando 100%', () => {
    const larguras = [
      'colItem', 'colFoto', 'colCode', 'colDescription', 'colQtdCx', 'colQtdUnit',
      'colQtdTotal', 'colVlrTb', 'colDescPerc', 'colVlrComDesc', 'colIpi',
      'colVlrComImp', 'colTotalSemImp',
    ] as const;

    const soma = larguras.reduce(
      (total, nome) => total + Number.parseFloat(orderValidationPdfStyles[nome].width as string),
      0,
    );

    expect(soma).toBeCloseTo(100, 6);
  });

  it('mantém o fornecedor em negrito sem dominar o cabeçalho', () => {
    expect(orderValidationPdfStyles.headerSupplier.fontFamily).toBe('Helvetica-Bold');
    expect(orderValidationPdfStyles.headerSupplier.fontSize).toBeLessThan(
      orderValidationPdfStyles.headerRef.fontSize,
    );
  });
});
