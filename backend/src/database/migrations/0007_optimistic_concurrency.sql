-- Sem BEGIN/COMMIT próprios: o runner (`migrate.ts`) já envolve cada arquivo
-- numa transação e só então grava em `schema_migrations`. Um COMMIT aqui
-- dentro encerrava a transação EXTERNA antes desse registro, destruindo a
-- atomicidade "aplicou <=> registrou" justo no provisionamento de banco vazio
-- (BACKLOG-0035; assinatura compatível com PROB-0060/0061, onde migration
-- consta aplicada e os objetos não existem).
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
