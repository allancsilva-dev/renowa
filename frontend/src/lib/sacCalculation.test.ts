import { describe, expect, it } from 'vitest';
import { SAC_ITEM_CASES, SAC_TOTAL_CASES } from '@renowa/shared';
import { previewSacItem, previewSacTotal } from './sacCalculation';

/**
 * Os casos abaixo são específicos do preview. Os casos COMPARTILHADOS com o
 * backend estão na fixture `@renowa/shared`, iterada no fim deste arquivo —
 * antes de BACKLOG-0057 este comentário afirmava paridade que não existia.
 * Se o preview divergir do servidor, o usuário vê um total na tela e outro no
 * papel impresso.
 */
describe('previewSacItem', () => {
  it('multiplica quantidade por valor unitário', () => {
    expect(previewSacItem({ quantidade: 3, valor_unitario: 10.5 })).toEqual({
      quantidade: '3.000',
      valor_unitario: '10.50',
      valor_total: '31.50',
    });
  });

  it('multiplica o valor unitário já arredondado, e não a precisão cheia', () => {
    const item = previewSacItem({ quantidade: 3, valor_unitario: 0.005 });
    expect(item.valor_unitario).toBe('0.01');
    expect(item.valor_total).toBe('0.03');
  });

  it('mantém 3 casas na quantidade, com HALF_UP', () => {
    expect(previewSacItem({ quantidade: 1.2345, valor_unitario: 1 }).quantidade).toBe('1.235');
    expect(previewSacItem({ quantidade: 1.2344, valor_unitario: 1 }).quantidade).toBe('1.234');
  });

  // O form mantém os campos como string e o valor monetário começa nulo.
  it('trata string vazia e nulo como zero', () => {
    expect(previewSacItem({ quantidade: '', valor_unitario: null })).toEqual({
      quantidade: '0.000',
      valor_unitario: '0.00',
      valor_total: '0.00',
    });
  });
});

describe('previewSacTotal', () => {
  it('soma os totais das linhas', () => {
    expect(previewSacTotal([
      { quantidade: 2, valor_unitario: 10 },
      { quantidade: 3, valor_unitario: 5.5 },
    ])).toBe('36.50');
  });

  it('soma os valores já arredondados, batendo com o que é impresso', () => {
    expect(previewSacTotal([
      { quantidade: 1, valor_unitario: 0.005 },
      { quantidade: 1, valor_unitario: 0.005 },
    ])).toBe('0.02');
  });

  it('devolve zero para chamado sem itens', () => {
    expect(previewSacTotal([])).toBe('0.00');
  });
});

/**
 * BACKLOG-0057: paridade REAL com o backend.
 *
 * O comentário no topo deste arquivo afirmava que os casos eram os mesmos do
 * backend. Não eram — eram duas listas escritas à mão, e cada lado cobria
 * bordas que o outro ignorava. A fixture abaixo vive em `@renowa/shared` e é
 * iterada aqui e em `backend/src/sac/sac-calculation.spec.ts`: agora "os
 * mesmos casos" é mecanismo, não promessa.
 */
describe('paridade com o backend (fixture compartilhada)', () => {
  it.each(SAC_ITEM_CASES.map((caso) => [caso.nome, caso] as const))(
    'item: %s',
    (_nome, caso) => {
      expect(previewSacItem({
        quantidade: caso.quantidade as string | number,
        valor_unitario: caso.valor_unitario,
      })).toEqual(caso.esperado);
    },
  );

  it.each(SAC_TOTAL_CASES.map((caso) => [caso.nome, caso] as const))(
    'total: %s',
    (_nome, caso) => {
      expect(previewSacTotal(caso.itens.map((item) => ({
        quantidade: item.quantidade as string | number,
        valor_unitario: item.valor_unitario,
      })))).toBe(caso.esperado);
    },
  );
});
