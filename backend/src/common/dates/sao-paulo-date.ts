/** Data civil (YYYY-MM-DD) em America/Sao_Paulo — `toISOString` usa UTC e vira o dia após 21h. */
export function saoPauloDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}
