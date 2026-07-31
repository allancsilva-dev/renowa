/**
 * Códigos de erro do PostgreSQL reconhecidos pela aplicação.
 *
 * Só entram aqui os que a aplicação REAGE — não é um catálogo do Postgres.
 */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * `23505` é o `unique_violation` do PostgreSQL.
 *
 * Checado por FORMA (`driverError` ou `code` na raiz) em vez de
 * `instanceof QueryFailedError`: o mesmo erro chega embrulhado ou cru
 * dependendo de quem executou a query (repositório, manager ou `query` direto),
 * e a forma sobrevive a troca de versão do TypeORM.
 */
export function isUniqueViolation(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  const alvo = exception as Error & { code?: unknown; driverError?: { code?: unknown } };
  return alvo.driverError?.code === PG_UNIQUE_VIOLATION || alvo.code === PG_UNIQUE_VIOLATION;
}
