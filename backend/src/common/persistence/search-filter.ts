/**
 * Busca textual das listagens (nº de pedido, CNPJ, razão social).
 *
 * - O termo é cortado em `MAX_SEARCH_LENGTH` e tem `\`, `%` e `_` escapados:
 *   digitar `%` não pode virar curinga que devolve a tabela inteira.
 * - CNPJ é gravado com ou sem máscara. Quando o termo é só dígitos e pontuação
 *   de documento, compara também contra o CNPJ sem máscara. Exige
 *   `MIN_CNPJ_DIGITS` dígitos para que buscar o pedido "12" não traga todo
 *   CNPJ que contenha "12".
 */
export const MAX_SEARCH_LENGTH = 100;
export const MIN_CNPJ_DIGITS = 5;

export interface SearchFields {
  /** Expressões SQL de texto comparadas com ILIKE (use CAST para números). */
  text: string[];
  /** Colunas de CNPJ: comparadas como texto e, se couber, só pelos dígitos. */
  cnpj?: string[];
}

export interface SearchClause {
  where: string;
  params: { search: string; searchDigits?: string };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildSearchClause(raw: string | undefined | null, fields: SearchFields): SearchClause | null {
  const term = (raw ?? '').trim().slice(0, MAX_SEARCH_LENGTH);
  if (!term) return null;

  const cnpj = fields.cnpj ?? [];
  const conditions = [...fields.text, ...cnpj].map((expr) => `${expr} ILIKE :search`);
  const params: SearchClause['params'] = { search: `%${escapeLike(term)}%` };

  const digits = term.replace(/\D/g, '');
  if (cnpj.length && /^[\d.\-/\s]+$/.test(term) && digits.length >= MIN_CNPJ_DIGITS) {
    for (const expr of cnpj) conditions.push(`regexp_replace(${expr}, '\\D', '', 'g') LIKE :searchDigits`);
    params.searchDigits = `%${digits}%`;
  }

  return { where: `(${conditions.join(' OR ')})`, params };
}

/** Aplica `buildSearchClause` num query builder; termo vazio não filtra nada. */
export function applySearch<Q extends { andWhere(where: string, params?: object): unknown }>(
  qb: Q,
  raw: string | undefined | null,
  fields: SearchFields,
): Q {
  const clause = buildSearchClause(raw, fields);
  if (clause) qb.andWhere(clause.where, clause.params);
  return qb;
}
