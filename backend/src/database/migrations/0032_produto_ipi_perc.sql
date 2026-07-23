ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS ipi_perc numeric(5,2);

ALTER TABLE produtos
  DROP CONSTRAINT IF EXISTS produtos_ipi_perc_range;

ALTER TABLE produtos
  ADD CONSTRAINT produtos_ipi_perc_range CHECK (ipi_perc BETWEEN 0 AND 100) NOT VALID;
