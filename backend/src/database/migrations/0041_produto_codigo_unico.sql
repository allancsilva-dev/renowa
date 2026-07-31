-- Código do produto único por fornecedor.
--
-- A tupla não é escolha nova: a importação em massa (`ProductsService.importFromFile`)
-- já trata (tenant, fornecedor, codigo) como CHAVE NATURAL — acha a linha por ela e
-- ATUALIZA em vez de inserir. O cadastro manual, não: `create` nunca checou nada e o
-- banco não tinha índice. As duas portas do mesmo catálogo discordavam entre si, e a
-- do meio (tela) deixava passar duplicata que a de cima (CSV) recusava.
--
-- O que forçou a decisão agora: o app de celular vai criar produto OFFLINE e
-- sincronizar depois. Duplicata deixa de ser erro de digitação de um operador e passa
-- a ser resultado previsível de dois vendedores sem rede. A identidade da entidade
-- (uuid do cliente) resolve o reenvio da MESMA criação; ela não resolve duas criações
-- DIFERENTES do mesmo produto. Só a chave natural resolve, e ela precisa estar no
-- banco: guarda de aplicação não vê duas transações simultâneas.
--
-- Índice PARCIAL nas duas pontas:
--   `codigo IS NOT NULL` — o campo é opcional (`CreateProductDto.codigo`), e produto
--   sem código é legítimo. NULLs não colidem entre si de qualquer forma, mas o
--   predicado deixa a intenção explícita e mantém o índice menor.
--   `deleted_at IS NULL` — produto excluído não pode reservar o código para sempre;
--   corrigir um cadastro errado é excluir e refazer. Mesmo padrão de
--   `uq_pedidos_externo_numero` (0038) e `uq_produto_fotos_produto` (0040).
--
-- `fornecedor_id` entra na chave porque o mesmo código em fornecedores distintos é
-- legítimo e comum: código é do catálogo DO FORNECEDOR, não do sistema. Fica de fora
-- da restrição, de propósito, o produto sem fornecedor (`fornecedor_id` NULL, legado
-- anterior à obrigatoriedade em `create`): NULL não colide, e retroagir regra nova
-- sobre linha antiga travaria a migration por dado que ninguém pediu para arrumar.
--
-- Efeito no sync: colisão vinda de dois dispositivos vira 23505, que
-- `SyncService.isPermanentMutationError` já classifica como falha PERMANENTE — o item
-- volta como `rejected` / `VALIDATION_FAILED`, não-retentável. É o desejado: a fila
-- não fica girando, e a resolução (renomear ou usar o produto existente) é do humano.
--
-- Segurança de aplicação: havendo duplicata em qualquer ambiente, o CREATE UNIQUE
-- INDEX falha e a migration PARA — comportamento desejado, porque fundir ou renomear
-- é decisão de negócio, não de schema. Conferir ANTES de aplicar em produção:
--   SELECT tenant_id, fornecedor_id, codigo, count(*)
--     FROM public.produtos
--    WHERE codigo IS NOT NULL AND deleted_at IS NULL
--    GROUP BY 1, 2, 3 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_produtos_codigo
  ON public.produtos (tenant_id, fornecedor_id, codigo)
  WHERE codigo IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_produtos_codigo IS
  'Código do produto único por fornecedor, entre os ativos. Chave natural do catálogo: a importação CSV já a usava para decidir entre criar e atualizar.';
