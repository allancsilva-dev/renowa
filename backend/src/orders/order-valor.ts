import { Order } from './entities/order.entity';
import { money } from '../common/decimal/decimal';

/**
 * Valor do pedido para faturamento, divergência e indicadores: o ajuste do
 * ADMIN (0049) quando existe, senão o total calculado. Uma função só — fila,
 * detalhe, recálculo de status e finalização não podem discordar do valor.
 */
export function orderValorEfetivo(
  order: Pick<Order, 'valor_ajustado' | 'total_com_imposto' | 'total_sem_imposto'>,
): string {
  return money(order.valor_ajustado ?? order.total_com_imposto ?? order.total_sem_imposto ?? 0);
}

/** Mesma regra em SQL, para agregações. `alias` prefixa as colunas. */
export function orderValorEfetivoSql(alias?: string): string {
  const p = alias ? `${alias}.` : '';
  return `COALESCE(${p}valor_ajustado, ${p}total_com_imposto, ${p}total_sem_imposto, 0)`;
}
