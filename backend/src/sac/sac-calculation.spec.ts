import { SAC_ITEM_CASES, SAC_TOTAL_CASES } from '@renowa/shared';
import { calculateSacItem, calculateSacTotal } from './sac-calculation';

describe('calculateSacItem', () => {
  it('multiplica quantidade por valor unitário', () => {
    expect(calculateSacItem({ quantidade: 3, valor_unitario: 10.5 })).toEqual({
      quantidade: '3.000',
      valor_unitario: '10.50',
      valor_total: '31.50',
    });
  });

  it('arredonda dinheiro com HALF_UP em 2 casas', () => {
    expect(calculateSacItem({ quantidade: 1, valor_unitario: 1.005 }).valor_total).toBe('1.01');
  });

  /**
   * O valor unitário é arredondado ANTES da multiplicação — é ele que vai
   * impresso na coluna VL UNI. (NF). Multiplicar a precisão cheia daria um
   * total que não confere com a conta que o cliente refaz olhando o papel.
   * Mesma política de `order-calculation.ts`.
   */
  it('multiplica o valor unitário já arredondado, e não a precisão cheia', () => {
    const item = calculateSacItem({ quantidade: 3, valor_unitario: 0.005 });
    expect(item.valor_unitario).toBe('0.01');
    expect(item.valor_total).toBe('0.03');
  });

  it('mantém 3 casas na quantidade, com HALF_UP', () => {
    expect(calculateSacItem({ quantidade: 1.2345, valor_unitario: 1 }).quantidade).toBe('1.235');
    expect(calculateSacItem({ quantidade: 1.2344, valor_unitario: 1 }).quantidade).toBe('1.234');
  });

  it('trata ausência de valor como zero', () => {
    expect(calculateSacItem({})).toEqual({
      quantidade: '0.000',
      valor_unitario: '0.00',
      valor_total: '0.00',
    });
  });

  it('aceita string (valor vindo do banco como numeric)', () => {
    expect(calculateSacItem({ quantidade: '2.500', valor_unitario: '4.00' }).valor_total).toBe('10.00');
  });
});

describe('calculateSacTotal', () => {
  it('soma os totais das linhas', () => {
    const items = [
      calculateSacItem({ quantidade: 2, valor_unitario: 10 }),
      calculateSacItem({ quantidade: 3, valor_unitario: 5.5 }),
    ];
    expect(calculateSacTotal(items)).toBe('36.50');
  });

  /**
   * Soma dos valores JÁ arredondados: o papel impresso mostra a coluna
   * VL. TOTAL NF de cada linha, e o TOTAL do rodapé precisa ser exatamente a
   * soma do que está impresso — não a soma dos valores em precisão cheia.
   */
  it('soma os valores já arredondados, batendo com o que é impresso', () => {
    const items = [
      calculateSacItem({ quantidade: 1, valor_unitario: 0.005 }),
      calculateSacItem({ quantidade: 1, valor_unitario: 0.005 }),
    ];
    expect(items.map((item) => item.valor_total)).toEqual(['0.01', '0.01']);
    expect(calculateSacTotal(items)).toBe('0.02');
  });

  it('devolve zero para chamado sem itens', () => {
    expect(calculateSacTotal([])).toBe('0.00');
  });
});

/**
 * BACKLOG-0057: paridade REAL com o frontend.
 *
 * Antes existiam duas listas de casos escritas à mão, e o comentário do teste
 * do frontend afirmava que eram as mesmas. Não eram: 7 casos lá, 9 aqui, cada
 * lado cobrindo bordas que o outro ignorava. Uma divergência de arredondamento
 * passaria pelas duas suítes verdes e só apareceria com o total da tela
 * diferente do total do papel impresso.
 *
 * A fixture vive em `@renowa/shared` e é iterada aqui e em
 * `frontend/src/lib/sacCalculation.test.ts`. Caso novo vale para os dois.
 */
describe('paridade com o preview do frontend (fixture compartilhada)', () => {
  it.each(SAC_ITEM_CASES.map((caso) => [caso.nome, caso] as const))(
    'item: %s',
    (_nome, caso) => {
      expect(calculateSacItem({
        quantidade: caso.quantidade,
        valor_unitario: caso.valor_unitario,
      })).toEqual(caso.esperado);
    },
  );

  it.each(SAC_TOTAL_CASES.map((caso) => [caso.nome, caso] as const))(
    'total: %s',
    (_nome, caso) => {
      const itens = caso.itens.map((item) => calculateSacItem(item));
      expect(calculateSacTotal(itens)).toBe(caso.esperado);
    },
  );
});
