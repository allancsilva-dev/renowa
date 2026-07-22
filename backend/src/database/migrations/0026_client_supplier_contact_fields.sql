-- Fluxo Comercial Completo (Fase 2): clientes/fornecedores ganham campos de
-- endereço completo para suportar a consulta de CNPJ (BrasilAPI) e o cadastro
-- dedicado de fornecedor (FornecedorForm.tsx, Fase 4). Tudo nullable: clientes
-- e fornecedores legados não têm esses dados e não podem ser bloqueados.

-- clientes já tem endereco/bairro/cidade/uf/cep/inscricao_estadual (baseline);
-- faltam só numero/complemento (mesmo padrão de endereço usado pelo cliente).
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS numero varchar,
  ADD COLUMN IF NOT EXISTS complemento varchar;

-- fornecedores hoje só tem razao_social/cnpj (baseline) — precisa do mesmo
-- conjunto de campos de endereço/contato que clientes já possuem, para que
-- FornecedorForm.tsx (Fase 4) espelhe ClienteForm.tsx sem gambiarra de schema.
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS endereco varchar,
  ADD COLUMN IF NOT EXISTS numero varchar,
  ADD COLUMN IF NOT EXISTS complemento varchar,
  ADD COLUMN IF NOT EXISTS bairro varchar,
  ADD COLUMN IF NOT EXISTS cidade varchar,
  ADD COLUMN IF NOT EXISTS uf varchar(2),
  ADD COLUMN IF NOT EXISTS cep varchar,
  ADD COLUMN IF NOT EXISTS telefone varchar,
  ADD COLUMN IF NOT EXISTS inscricao_estadual varchar;
