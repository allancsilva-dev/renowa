-- Remove `produto_fotos.origem_pedido_id` — vestígio de `pedido_fotos`.
--
-- A coluna nasceu na 0040 com uma única finalidade: guardar de qual pedido veio cada
-- foto MIGRADA da tabela `pedido_fotos` (dropada pela mesma migration), para que uma
-- solicitação de exclusão LGPD do cliente daquele pedido alcançasse o binário. Foto de
-- nota fiscal traz nome, CNPJ e endereço no pixel (PROB-0075).
--
-- O que mudou: nenhum caminho de código escreve a coluna. `ProductPhotosService.upsert`
-- grava `origem_pedido_id: null` sempre — a única origem possível era o bloco de
-- migração da 0040, e `pedido_fotos` está vazia. Uma foto de CATÁLOGO não pertence a
-- titular nenhum: ela é do produto, aparece no papel de todo pedido que o usar, e é
-- compartilhada por todos os clientes que compraram aquele produto.
--
-- Por que remover em vez de deixar a coluna quieta:
--
--   1. O inventário de PII declarava um controle inexistente. A regra de ERASURE de
--      `produto_fotos` gerava `WHERE tenant_id = $1 AND origem_pedido_id IN (...)` —
--      predicado que nunca casa linha nenhuma. Regra morta esconde risco em vez de
--      registrá-lo; `produto_fotos` passa a `TABELAS_SEM_PII`, com justificativa, e o
--      controle real vira o aviso na tela de cadastro do produto.
--   2. Se a coluna voltar a ser preenchida, o MESMO comando de ERASURE apaga a foto de
--      catálogo compartilhada: o cliente A pede exclusão e o produto fica sem foto para
--      todos os outros pedidos, em silêncio. Sem a coluna, esse caminho não existe.
--   3. O `DISTINCT ON` da 0040 (`ORDER BY f.tenant_id, i.produto_id, f.created_at DESC`,
--      sem `, f.id DESC`) escolhe arbitrariamente entre fotos do mesmo produto com o
--      mesmo `created_at`. Com a coluna fora e a tabela de origem vazia, o defeito deixa
--      de ter efeito prático — fica registrado no BACKLOG para o dia em que a 0040 for
--      reescrita, e nunca editado no arquivo já aplicado (migration é imutável, PROB-0072).
--
-- Segurança de aplicação: a guarda abaixo faz a migration PARAR se existir foto com
-- `origem_pedido_id` preenchido. Isso só acontece se `pedido_fotos` NÃO estiver vazia no
-- momento em que a 0040 rodar — o cenário que o gate de deploy manda checar antes. Nesse
-- caso, dropar a coluna destruiria um vínculo de titular real, então a decisão volta para
-- o humano: mesma filosofia do CREATE UNIQUE INDEX da 0041. Conferir ANTES de aplicar:
--   SELECT count(*) FROM public.produto_fotos WHERE origem_pedido_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.produto_fotos WHERE origem_pedido_id IS NOT NULL) THEN
    RAISE EXCEPTION 'produto_fotos tem linha com origem_pedido_id nao nulo: a purga por titular ainda alcanca essas fotos. Resolver antes de dropar a coluna.';
  END IF;
END $$;

ALTER TABLE public.produto_fotos
  DROP CONSTRAINT IF EXISTS fk_produto_fotos_tenant_pedido_origem;

ALTER TABLE public.produto_fotos
  DROP COLUMN IF EXISTS origem_pedido_id;

COMMENT ON TABLE public.produto_fotos IS
  'Foto do catálogo, uma por produto. Conteúdo comercial sem titular: nenhuma solicitação LGPD a alcança, e o controle contra PII no binário é o aviso na tela de cadastro. Ver TABELAS_SEM_PII em backend/src/privacy/pii-registry.ts.';
