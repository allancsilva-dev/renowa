-- Relatório somente leitura. Pedidos históricos não são regravados automaticamente.
SELECT
  p.tenant_id,
  p.uuid AS pedido_uuid,
  p.numero_pedido,
  p.total_sem_imposto AS total_persistido_sem_imposto,
  COALESCE(SUM(i.qtd_caixas * i.qtd_unitaria * i.preco_unitario * (1 - i.desconto_perc / 100)), 0)
    AS total_calculado_sem_imposto,
  p.total_com_imposto AS total_persistido_com_imposto,
  COALESCE(SUM(i.qtd_caixas * i.qtd_unitaria * i.preco_unitario * (1 - i.desconto_perc / 100) * (1 + COALESCE(i.ipi_perc, 0) / 100)), 0)
    AS total_calculado_com_imposto
FROM pedidos p
LEFT JOIN itens_pedido i
  ON i.tenant_id = p.tenant_id AND i.pedido_id = p.id AND i.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.tenant_id, p.uuid, p.numero_pedido, p.total_sem_imposto, p.total_com_imposto
HAVING p.total_sem_imposto IS DISTINCT FROM ROUND(COALESCE(SUM(i.qtd_caixas * i.qtd_unitaria * i.preco_unitario * (1 - i.desconto_perc / 100)), 0), 2)
   OR p.total_com_imposto IS DISTINCT FROM ROUND(COALESCE(SUM(i.qtd_caixas * i.qtd_unitaria * i.preco_unitario * (1 - i.desconto_perc / 100) * (1 + COALESCE(i.ipi_perc, 0) / 100)), 0), 2);
