import { RequestUser } from '../common/types/jwt-payload.type';
import { normalizeRole } from '../common/authorization/roles';

/**
 * Ownership de pedido por vendedor.
 *
 * Um usuário cuja ÚNICA role é VENDEDOR só enxerga os pedidos em que é o
 * vendedor. Quem acumula outra role (ADMIN/GESTAO/FINANCEIRO) vê todos.
 *
 * Extraído de `OrdersService` para que tudo pendurado no pedido — hoje as
 * fotos — aplique exatamente a mesma regra. Duplicar esta condição é como o
 * IDOR volta: basta um caminho novo esquecer o filtro.
 */
export function isVendorOnly(user: RequestUser): boolean {
  // Sem caixa: o login nativo grava 'vendedor' e a comparação exata deixava
  // esse usuário ver os pedidos de todos.
  const roles = new Set((user.roles ?? []).map(normalizeRole));
  return roles.size === 1 && roles.has('VENDEDOR');
}

/**
 * Condição SQL de ownership, no formato aceito por `optimisticUpdate`/
 * `optimisticSoftDelete`. Compara pelo `uuid` do JWT resolvido em subquery
 * para não precisar de um round-trip extra.
 *
 * `alias` prefixa a coluna quando a query tem alias (ex.: `'o'`); em UPDATE,
 * que não aceita alias no Postgres, deve ser omitido.
 */
export function vendorOwnershipWhere(
  user: RequestUser,
  alias?: string,
): { sql: string; params: { sub: string; tenantId: string } } {
  const coluna = alias ? `${alias}.vendedor_id` : 'vendedor_id';
  return {
    sql: `${coluna} = (SELECT id FROM usuarios WHERE uuid = :sub AND tenant_id = :tenantId LIMIT 1)`,
    params: { sub: user.sub, tenantId: user.tenantId },
  };
}
