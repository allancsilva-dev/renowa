-- Fluxo Comercial Completo (Fase 2): faturamento 1:N — um pedido pode ter
-- várias notas fiscais (parcial/total). Tabela nova segue o mesmo esqueleto
-- de VersionedBaseEntity (id/uuid/tenant_id/created_at/updated_at/deleted_at
-- /version) usado por clientes/fornecedores/pedidos/comissões.
CREATE TABLE IF NOT EXISTS public.notas_fiscais (
  id serial PRIMARY KEY,
  uuid uuid DEFAULT public.uuid_generate_v4() NOT NULL,
  tenant_id uuid NOT NULL,
  pedido_id int NOT NULL,
  numero_nota varchar NOT NULL,
  serie varchar,
  valor numeric(18, 2) NOT NULL,
  data_emissao date,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version int NOT NULL DEFAULT 1 CHECK (version > 0)
);

-- Índices únicos (tenant_id,id)/(tenant_id,uuid): obrigatórios em toda tabela
-- nova (padrão de 0021_cross_tenant_foreign_keys.sql); (tenant_id,id) também é
-- o alvo exigido pela FK composta tenant abaixo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_tenant_id_id
  ON public.notas_fiscais (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_tenant_id_uuid
  ON public.notas_fiscais (tenant_id, uuid);

-- (tenant_id, updated_at): usado por sync/listagens ordenadas por atualização.
-- (tenant_id, deleted_at): usado por queries que filtram registros ativos.
-- (tenant_id, pedido_id): usado pelo detalhe/histórico de notas de um pedido
-- (GET /faturamento/pedidos/:uuid) e pelo recálculo de soma de notas ativas.
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_tenant_updated
  ON public.notas_fiscais (tenant_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_tenant_deleted
  ON public.notas_fiscais (tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_tenant_pedido
  ON public.notas_fiscais (tenant_id, pedido_id);

-- Tabela nova e vazia: a FK pode ser criada já validada (sem custo de scan
-- em dado legado, diferente do cenário de 0021). Mantém a mesma forma de FK
-- composta tenant (tenant_id, pedido_id) -> pedidos(tenant_id, id).
-- PostgreSQL não suporta "ADD CONSTRAINT IF NOT EXISTS" — idempotência via
-- checagem manual em pg_constraint (mesmo padrão de 0021).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_notas_fiscais_tenant_pedido') THEN
    ALTER TABLE public.notas_fiscais
      ADD CONSTRAINT fk_notas_fiscais_tenant_pedido
      FOREIGN KEY (tenant_id, pedido_id) REFERENCES public.pedidos (tenant_id, id);
  END IF;
END $$;

-- Regra de negócio: nota não pode se repetir dentro do mesmo pedido.
-- Parcial (WHERE deleted_at IS NULL) para permitir reemitir o mesmo número
-- depois de uma exclusão (soft delete) sem violar unicidade histórica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_tenant_pedido_numero_active
  ON public.notas_fiscais (tenant_id, pedido_id, numero_nota)
  WHERE deleted_at IS NULL;

-- updated_at é autoridade exclusiva do PostgreSQL (contrato de
-- 0020_utc_timestamps_db_authority.sql) — precisa do mesmo trigger que
-- todas as demais tabelas com essa coluna já têm. CREATE OR REPLACE aqui é
-- defensivo/idempotente (função idêntica à definida em 0020): não assume que
-- o runtime effect de uma migration anterior já marcada como aplicada ainda
-- está presente no banco — só garante que ESTA migration não depende de
-- estado externo para criar o trigger de notas_fiscais.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notas_fiscais_updated_at ON public.notas_fiscais;
CREATE TRIGGER trg_notas_fiscais_updated_at
  BEFORE INSERT OR UPDATE ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
