/**
 * Data `YYYY-MM-DD` pronta para uso. O `<input type='date'>` emite valor a cada
 * dígito do ano (2 → `0002-…`, 20 → `0020-…`); só aceitar ano plausível impede
 * que filtro ou ação dispare com o ano pela metade.
 */
export function isDataCompleta(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [ano, mes, dia] = value.split('-').map(Number);
  if (ano < 2000 || ano > 2100) return false;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** Hoje em `YYYY-MM-DD` no fuso do navegador — `toISOString` usa UTC e vira o dia após 21h. */
export function hojeLocal(agora: Date = new Date()): string {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}
