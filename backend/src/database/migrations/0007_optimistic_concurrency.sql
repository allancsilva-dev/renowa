BEGIN;

ALTER TABLE public.pedidos
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE public.financeiro_movimentacao
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE public.comissoes
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE public.parceiros_comerciais
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE public.inadimplencia
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

COMMIT;
