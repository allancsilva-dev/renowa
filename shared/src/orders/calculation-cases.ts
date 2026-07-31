/**
 * Casos de cálculo do item de pedido, como DADO puro.
 *
 * `backend/src/orders/order-calculation.ts` é o contrato autoritativo e
 * `frontend/src/lib/orderCalculation.ts` é a prévia da tela. As duas
 * implementam a mesma aritmética, e o teste do frontend afirmava espelhar o
 * backend — mas os números eram cópia manual, um único caso de cada lado, todos
 * com resultado exato. Nenhum deles distinguia "arredonda no unitário" de
 * "arredonda no total da linha", que é justamente a política do BACKLOG-0065.
 *
 * Mesmo remédio do BACKLOG-0057 no SAC: as duas suítes iteram esta fixture.
 * Caso novo entra aqui uma vez e vale para os dois lados; divergência de
 * comportamento quebra um deles.
 *
 * Sem dependência de runner: é dado, consumido por Jest no backend e por Vitest
 * no frontend.
 */

export interface OrderItemCase {
  /** O que este caso protege. Vira o nome do teste nos dois lados. */
  readonly nome: string;
  readonly entrada: {
    readonly qtd_caixas?: string | number | null;
    readonly qtd_unitaria?: string | number | null;
    readonly preco_unitario?: string | number | null;
    readonly desconto_perc?: string | number | null;
    readonly ipi_perc?: string | number | null;
  };
  /** Campos calculados pelos dois lados. */
  readonly esperado: {
    readonly qtd_total: string;
    /** Leitura: exibido na tela e no papel, nunca reusado na aritmética. */
    readonly valor_com_desconto: string;
    /** Leitura. */
    readonly valor_com_imposto: string;
    readonly total_sem_imposto: string;
    readonly total_com_imposto: string;
  };
  /** Normalização de entrada — só o backend devolve estes campos. */
  readonly esperado_normalizado?: {
    readonly qtd_caixas: string;
    readonly qtd_unitaria: string;
    readonly preco_unitario: string;
    readonly desconto_perc: string;
    readonly ipi_perc: string;
  };
}

export const ORDER_ITEM_CASES: readonly OrderItemCase[] = [
  {
    nome: 'reproduz a fórmula de referência da planilha',
    entrada: { qtd_caixas: 3, qtd_unitaria: 10, preco_unitario: 100, desconto_perc: 10, ipi_perc: 5 },
    esperado: {
      qtd_total: '30.000',
      valor_com_desconto: '90.00',
      valor_com_imposto: '94.50',
      total_sem_imposto: '2700.00',
      total_com_imposto: '2835.00',
    },
    esperado_normalizado: {
      qtd_caixas: '3.000', qtd_unitaria: '10.000', preco_unitario: '100.00',
      desconto_perc: '10.00', ipi_perc: '5.00',
    },
  },
  {
    // BACKLOG-0065. O unitário com imposto é 25,245: arredondá-lo para 25,25
    // antes de multiplicar dava 101,00 na linha. Arredondando só no total, dá
    // 100,98 — e o IPI da linha (9,18) é exatamente 10% da base (91,80).
    nome: 'arredonda no total da linha, não no unitário',
    entrada: { qtd_caixas: 4, qtd_unitaria: 1, preco_unitario: 25.5, desconto_perc: 10, ipi_perc: 10 },
    esperado: {
      qtd_total: '4.000',
      valor_com_desconto: '22.95',
      valor_com_imposto: '25.25',
      total_sem_imposto: '91.80',
      total_com_imposto: '100.98',
    },
  },
  {
    // Dízima no desconto: unitário cru 6,667. Arredondar o unitário daria
    // 6,67 × 3 = 20,01; arredondar a linha dá 20,00.
    nome: 'desconto com dízima não propaga o centavo para a linha',
    entrada: { qtd_caixas: 3, qtd_unitaria: 1, preco_unitario: 10, desconto_perc: 33.33, ipi_perc: 0 },
    esperado: {
      qtd_total: '3.000',
      valor_com_desconto: '6.67',
      valor_com_imposto: '6.67',
      total_sem_imposto: '20.00',
      total_com_imposto: '20.00',
    },
  },
  {
    // O caso clássico de HALF_UP: em ROUND_HALF_EVEN daria 1.00. O preço
    // digitado continua sendo normalizado a 2 casas na ENTRADA — a precisão
    // cheia é só do produto intermediário.
    nome: '1.005 arredonda para 1.01 na entrada, não 1.00',
    entrada: { qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '1.005' },
    esperado: {
      qtd_total: '1.000',
      valor_com_desconto: '1.01',
      valor_com_imposto: '1.01',
      total_sem_imposto: '1.01',
      total_com_imposto: '1.01',
    },
    esperado_normalizado: {
      qtd_caixas: '1.000', qtd_unitaria: '1.000', preco_unitario: '1.01',
      desconto_perc: '0.00', ipi_perc: '0.00',
    },
  },
  {
    nome: 'quantidade zero zera a linha sem perder o unitário',
    entrada: { qtd_caixas: 0, qtd_unitaria: 10, preco_unitario: 9999999999.99 },
    esperado: {
      qtd_total: '0.000',
      valor_com_desconto: '9999999999.99',
      valor_com_imposto: '9999999999.99',
      total_sem_imposto: '0.00',
      total_com_imposto: '0.00',
    },
  },
  {
    nome: 'desconto e IPI ausentes valem zero',
    entrada: { qtd_caixas: 2, qtd_unitaria: 5, preco_unitario: '12.34' },
    esperado: {
      qtd_total: '10.000',
      valor_com_desconto: '12.34',
      valor_com_imposto: '12.34',
      total_sem_imposto: '123.40',
      total_com_imposto: '123.40',
    },
  },
  {
    // Numeric do Postgres volta como string pelo driver.
    nome: 'strings vindas do banco são aceitas',
    entrada: { qtd_caixas: '2.000', qtd_unitaria: '3.000', preco_unitario: '4.20', desconto_perc: '0.00', ipi_perc: '5.00' },
    esperado: {
      qtd_total: '6.000',
      valor_com_desconto: '4.20',
      valor_com_imposto: '4.41',
      total_sem_imposto: '25.20',
      total_com_imposto: '26.46',
    },
  },
  {
    nome: 'quantidade fracionária mantém 3 casas',
    entrada: { qtd_caixas: 1.5, qtd_unitaria: 2, preco_unitario: 3.33, desconto_perc: 0, ipi_perc: 0 },
    esperado: {
      qtd_total: '3.000',
      valor_com_desconto: '3.33',
      valor_com_imposto: '3.33',
      total_sem_imposto: '9.99',
      total_com_imposto: '9.99',
    },
  },
];

export interface OrderTotalsCase {
  readonly nome: string;
  readonly itens: readonly OrderItemCase['entrada'][];
  /** Campos calculados pelos dois lados. */
  readonly esperado: {
    readonly total_sem_imposto: string;
    readonly total_com_imposto: string;
  };
  /** Só o backend agrega estes — a prévia da tela não os exibe. */
  readonly esperado_backend?: {
    readonly valor_bruto: string;
    readonly desconto_total: string;
    readonly ipi_total: string;
  };
}

export const ORDER_TOTALS_CASES: readonly OrderTotalsCase[] = [
  {
    nome: 'lista vazia',
    itens: [],
    esperado: { total_sem_imposto: '0.00', total_com_imposto: '0.00' },
    esperado_backend: { valor_bruto: '0.00', desconto_total: '0.00', ipi_total: '0.00' },
  },
  {
    nome: 'item único da planilha de referência',
    itens: [{ qtd_caixas: 3, qtd_unitaria: 10, preco_unitario: 100, desconto_perc: 10, ipi_perc: 5 }],
    esperado: { total_sem_imposto: '2700.00', total_com_imposto: '2835.00' },
    esperado_backend: { valor_bruto: '3000.00', desconto_total: '300.00', ipi_total: '135.00' },
  },
  {
    // O pedido medido em runtime no BACKLOG-0065: fechava em 202,00 com
    // `IPI total` 18,40, enquanto 10% de 183,60 é 18,36. Agora bate.
    nome: 'dois itens de 4 × 25,50 com −10% e +10% fecham em 201,96',
    itens: [
      { qtd_caixas: 4, qtd_unitaria: 1, preco_unitario: 25.5, desconto_perc: 10, ipi_perc: 10 },
      { qtd_caixas: 4, qtd_unitaria: 1, preco_unitario: 25.5, desconto_perc: 10, ipi_perc: 10 },
    ],
    esperado: { total_sem_imposto: '183.60', total_com_imposto: '201.96' },
    esperado_backend: { valor_bruto: '204.00', desconto_total: '20.40', ipi_total: '18.36' },
  },
  {
    // Somar antes de arredondar daria 0.30; os totais somados são os das linhas
    // JÁ arredondadas, que é o que o papel imprime.
    nome: 'soma os totais de linha já arredondados',
    itens: [
      { qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: 0.11 },
      { qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: 0.11 },
      { qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: 0.11 },
    ],
    esperado: { total_sem_imposto: '0.33', total_com_imposto: '0.33' },
    esperado_backend: { valor_bruto: '0.33', desconto_total: '0.00', ipi_total: '0.00' },
  },
];
