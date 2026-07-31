-- Relatório somente leitura. Pedidos históricos não são regravados automaticamente.
--
-- BACKLOG-0065: a fórmula abaixo aplica desconto e IPI sobre a linha inteira,
-- sem arredondar o unitário — é a política definida em
-- `backend/src/orders/order-calculation.ts`. Usa `qtd_total` (persistida, já a
-- 3 casas) e não o produto cru de `qtd_caixas * qtd_unitaria`, para não divergir
-- do cálculo por arredondamento de quantidade.
--
-- Pedidos criados ANTES da mudança de política aparecem aqui por diferença de
-- centavos por linha. É o inventário esperado, não defeito novo.
SELECT
  p.tenant_id,
  p.uuid AS pedido_uuid,
  p.numero_pedido,
  p.total_sem_imposto AS total_persistido_sem_imposto,
  COALESCE(SUM(ROUND(i.qtd_total * i.preco_unitario * (1 - i.desconto_perc / 100), 2)), 0)
    AS total_calculado_sem_imposto,
  p.total_com_imposto AS total_persistido_com_imposto,
  COALESCE(SUM(ROUND(i.qtd_total * i.preco_unitario * (1 - i.desconto_perc / 100) * (1 + COALESCE(i.ipi_perc, 0) / 100), 2)), 0)
    AS total_calculado_com_imposto
FROM pedidos p
LEFT JOIN itens_pedido i
  ON i.tenant_id = p.tenant_id AND i.pedido_id = p.id AND i.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.tenant_id, p.uuid, p.numero_pedido, p.total_sem_imposto, p.total_com_imposto
HAVING p.total_sem_imposto IS DISTINCT FROM COALESCE(SUM(ROUND(i.qtd_total * i.preco_unitario * (1 - i.desconto_perc / 100), 2)), 0)
   OR p.total_com_imposto IS DISTINCT FROM COALESCE(SUM(ROUND(i.qtd_total * i.preco_unitario * (1 - i.desconto_perc / 100) * (1 + COALESCE(i.ipi_perc, 0) / 100), 2)), 0);
