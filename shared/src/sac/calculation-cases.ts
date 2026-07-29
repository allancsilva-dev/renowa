/**
 * Casos de cálculo do chamado de SAC, como DADO puro.
 *
 * BACKLOG-0057: `backend/src/sac/sac-calculation.ts` e
 * `frontend/src/lib/sacCalculation.ts` implementam a mesma aritmética, e o
 * comentário do teste do frontend afirmava que os casos eram os mesmos do
 * backend. Não eram — 7 casos de um lado, 9 do outro, cada um cobrindo bordas
 * que o outro ignorava. Uma divergência de arredondamento passaria pelas duas
 * suítes verdes.
 *
 * Agora as duas iteram esta fixture. Caso novo entra aqui uma vez e passa a
 * valer para os dois lados; divergência de comportamento quebra um deles.
 *
 * Sem dependência de runner: é dado, consumido por Jest no backend e por Vitest
 * no frontend.
 */

export interface SacItemCase {
  /** O que este caso protege. Vira o nome do teste nos dois lados. */
  readonly nome: string;
  readonly quantidade: string | number | null;
  readonly valor_unitario: string | number | null;
  readonly esperado: {
    readonly quantidade: string;
    readonly valor_unitario: string;
    readonly valor_total: string;
  };
}

export const SAC_ITEM_CASES: readonly SacItemCase[] = [
  {
    nome: 'multiplicação simples',
    quantidade: 2,
    valor_unitario: 10,
    esperado: { quantidade: '2.000', valor_unitario: '10.00', valor_total: '20.00' },
  },
  {
    nome: 'quantidade fracionária mantém 3 casas',
    quantidade: 1.5,
    valor_unitario: 3.33,
    esperado: { quantidade: '1.500', valor_unitario: '3.33', valor_total: '5.00' },
  },
  {
    nome: 'quantidade com mais de 3 casas arredonda HALF_UP',
    quantidade: 1.0005,
    valor_unitario: 100,
    esperado: { quantidade: '1.001', valor_unitario: '100.00', valor_total: '100.10' },
  },
  {
    // O caso clássico de HALF_UP: em ROUND_HALF_EVEN daria 1.00.
    nome: '1.005 arredonda para 1.01, não 1.00',
    quantidade: 1,
    valor_unitario: 1.005,
    esperado: { quantidade: '1.000', valor_unitario: '1.01', valor_total: '1.01' },
  },
  {
    // O valor unitário é arredondado ANTES de multiplicar. Arredondar só no fim
    // daria 20.02 aqui — a ordem das operações é parte do contrato.
    nome: 'valor unitário é arredondado antes de multiplicar',
    quantidade: 2,
    valor_unitario: 10.004,
    esperado: { quantidade: '2.000', valor_unitario: '10.00', valor_total: '20.00' },
  },
  {
    // Numeric do Postgres volta como string pelo driver.
    nome: 'string vinda do banco é aceita',
    quantidade: '2.500',
    valor_unitario: '4.20',
    esperado: { quantidade: '2.500', valor_unitario: '4.20', valor_total: '10.50' },
  },
  {
    nome: 'null vira zero',
    quantidade: null,
    valor_unitario: null,
    esperado: { quantidade: '0.000', valor_unitario: '0.00', valor_total: '0.00' },
  },
  {
    // O frontend sempre coalesceu; o backend usava `?? 0`, que não pega `''`, e
    // `new Decimal('')` LANÇA. Sem caminho HTTP hoje (o DTO exige @IsNumber),
    // mas um import de CSV ou migração chamando o service direto derrubava o
    // servidor com 500. Alinhado em BACKLOG-0057.
    nome: 'string vazia vira zero em vez de lançar',
    quantidade: '',
    valor_unitario: '',
    esperado: { quantidade: '0.000', valor_unitario: '0.00', valor_total: '0.00' },
  },
  {
    nome: 'zero explícito',
    quantidade: 0,
    valor_unitario: 0,
    esperado: { quantidade: '0.000', valor_unitario: '0.00', valor_total: '0.00' },
  },
  {
    nome: 'valor alto não perde precisão',
    quantidade: 1000,
    valor_unitario: 9999.99,
    esperado: { quantidade: '1000.000', valor_unitario: '9999.99', valor_total: '9999990.00' },
  },
];

export interface SacTotalCase {
  readonly nome: string;
  readonly itens: readonly { quantidade: string | number | null; valor_unitario: string | number | null }[];
  readonly esperado: string;
}

export const SAC_TOTAL_CASES: readonly SacTotalCase[] = [
  { nome: 'lista vazia', itens: [], esperado: '0.00' },
  {
    nome: 'soma de dois itens',
    itens: [{ quantidade: 2, valor_unitario: 10 }, { quantidade: 1, valor_unitario: 5.5 }],
    esperado: '25.50',
  },
  {
    // Somar antes de arredondar daria 0.30; o papel imprime a soma dos totais
    // JÁ arredondados, que é 0.33.
    nome: 'soma os totais já arredondados, não os valores crus',
    itens: [
      { quantidade: 1, valor_unitario: 0.111 },
      { quantidade: 1, valor_unitario: 0.111 },
      { quantidade: 1, valor_unitario: 0.111 },
    ],
    esperado: '0.33',
  },
];
