CREATE SEQUENCE IF NOT EXISTS pedidos_numero_seq START 1 INCREMENT 1 NO CYCLE;

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tipo_faturamento varchar;

ALTER TABLE itens_pedido
  ADD COLUMN IF NOT EXISTS qtd_total numeric(18,3),
  ADD COLUMN IF NOT EXISTS valor_com_desconto numeric(18,2),
  ADD COLUMN IF NOT EXISTS ipi_perc numeric(5,2),
  ADD COLUMN IF NOT EXISTS valor_com_imposto numeric(18,2),
  ADD COLUMN IF NOT EXISTS total_com_imposto numeric(18,2);

ALTER TABLE itens_pedido
  ALTER COLUMN preco_unitario TYPE numeric(18,2),
  ALTER COLUMN total_item TYPE numeric(18,2);

ALTER TABLE pedidos
  ALTER COLUMN total_sem_imposto TYPE numeric(18,2),
  ALTER COLUMN total_com_imposto TYPE numeric(18,2);

ALTER TABLE itens_pedido
  DROP CONSTRAINT IF EXISTS itens_pedido_desconto_perc_range,
  DROP CONSTRAINT IF EXISTS itens_pedido_ipi_perc_range;

ALTER TABLE itens_pedido
  ADD CONSTRAINT itens_pedido_desconto_perc_range CHECK (desconto_perc BETWEEN 0 AND 100) NOT VALID,
  ADD CONSTRAINT itens_pedido_ipi_perc_range CHECK (ipi_perc BETWEEN 0 AND 100) NOT VALID;
