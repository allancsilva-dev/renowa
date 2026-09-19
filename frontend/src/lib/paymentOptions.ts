/** Formas de pagamento canônicas, na ordem em que o comercial usa. */
export const PAYMENT_METHODS = ['BOL', 'BOL/BOL', 'BOL/CHEQUE', 'BOL/PIX', 'PIX'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Opções do `<select>` de forma de pagamento, com o valor atual anexado quando
 * ele não é canônico.
 *
 * O campo era texto livre (`pgt`/`pgt_padrao` continuam `varchar` livre no
 * banco, porque o import CSV e o push do sync ainda gravam qualquer string).
 * Sem a opção extra, abrir um registro antigo deixaria o `<select>` com um
 * `value` que não existe entre as options: o DOM cai na opção vazia e o próximo
 * save grava `null`, apagando o dado sem erro nenhum na tela.
 *
 * Por isso a lista tem de ser montada no render a partir do valor VIVO do
 * estado — não de uma cópia feita no mount. Trocar o cliente reescreve o
 * pagamento do pedido com o `pgt_padrao` dele (ver `applyClientToOrderHeader`),
 * que também pode ser legado.
 *
 * Não normaliza caixa: comparar exato evita reescrever "Pix" como "PIX".
 */
export function paymentOptionsWith(current?: string | null): string[] {
  const value = current?.trim();
  if (!value) return [...PAYMENT_METHODS];
  if ((PAYMENT_METHODS as readonly string[]).includes(value)) return [...PAYMENT_METHODS];
  return [...PAYMENT_METHODS, value];
}
