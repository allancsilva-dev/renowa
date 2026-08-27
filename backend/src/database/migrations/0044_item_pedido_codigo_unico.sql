-- Código único por item dentro do MESMO pedido.
--
-- O buraco: três portas escrevem `itens_pedido` — `OrdersService.create`,
-- `OrdersService.update` e `OrdersSyncWriter.writeItem` — e nenhuma checava código
-- repetido. O banco também não checava: a tabela só tinha unique em
-- `(tenant_id, uuid)`, que garante a IDENTIDADE da linha, não a chave de NEGÓCIO.
-- Resultado observado: 22 linhas com o mesmo código num pedido só. Cada linha
-- repetida infla `pedidos.total_*`, a fila de faturamento e a comissão.
--
-- Duas chaves, não uma, porque o item tem duas formas de carregar código:
--   `codigo_manual` — o campo digitado na tela (o form também o preenche com o
--   código do produto ao escolher um do catálogo);
--   `produto_id`    — o item vindo do sync pode trazer só `produto_uuid`, sem
--   `codigo_manual`, e aí a repetição não apareceria no índice de texto.
-- Item sem nenhum dos dois (só `descricao_manual`) fica de fora e pode repetir:
-- é o item avulso descrito à mão, e NULL não colide em índice.
--
-- O que o índice NÃO pega, de propósito: `codigo_manual` igual ao `produtos.codigo`
-- de um item irmão que veio do catálogo. O código do produto vive em OUTRA tabela e
-- índice não cruza tabela. Esse caso é da guarda de aplicação
-- (`assertCodigosItensUnicos`, em `orders/order-write.ts`), que resolve o código
-- efetivo antes de gravar. Padrão da casa: a guarda dá a mensagem de negócio, o
-- índice garante sob concorrência (duas abas, dois devices sincronizando).
--
-- Índice PARCIAL nas duas pontas, mesmo argumento de `uq_produtos_codigo` (0041):
--   `... IS NOT NULL` — o campo é opcional e NULL não colide de qualquer forma; o
--   predicado deixa a intenção explícita e mantém o índice menor.
--   `deleted_at IS NULL` — item excluído não pode reservar o código para sempre.
--   Corrigir uma linha errada é excluí-la e refazer, e `OrdersService.update` /
--   `OrdersSyncWriter.writeItem` RESSUSCITAM item soft-deletado
--   (`Object.assign(atual, values, { deleted_at: null })`).
--
-- Efeito no sync: colisão de corrida vira 23505, que
-- `SyncService.isPermanentMutationError` já classifica como falha PERMANENTE — o
-- item volta `rejected` / `VALIDATION_FAILED`, não-retentável. É o desejado: a fila
-- não fica girando e a resolução (apagar a linha ou trocar o código) é do humano.
--
-- Diferente de 0041, esta migration NÃO para diante de duplicata existente: o dado
-- duplicado já está em base, e a resolução aqui não é decisão de negócio — a linha
-- repetida nunca deveria ter sido aceita. As duplicatas são soft-deletadas
-- mantendo a MAIS ANTIGA (menor `id`) de cada grupo, e o cabeçalho é recalculado.
-- Conferir o estrago ANTES de aplicar:
--   SELECT tenant_id, pedido_id, codigo_manual, count(*)
--     FROM public.itens_pedido
--    WHERE codigo_manual IS NOT NULL AND deleted_at IS NULL
--    GROUP BY 1, 2, 3 HAVING count(*) > 1;
--   SELECT tenant_id, pedido_id, produto_id, count(*)
--     FROM public.itens_pedido
--    WHERE produto_id IS NOT NULL AND deleted_at IS NULL
--    GROUP BY 1, 2, 3 HAVING count(*) > 1;

-- Linhas condenadas: toda repetição depois da primeira, nas duas chaves. Um único
-- CTE cobre as duas para que o passo seguinte (fotos) e este vejam o MESMO
-- conjunto — resolver em dois UPDATEs encadeados exigiria reavaliar "vivo" no meio.
CREATE TEMPORARY TABLE itens_duplicados_0044 AS
  SELECT id, tenant_id, pedido_id FROM (
    SELECT id, tenant_id, pedido_id,
           row_number() OVER (
             PARTITION BY tenant_id, pedido_id, codigo_manual ORDER BY id
           ) AS posicao
      FROM public.itens_pedido
     WHERE codigo_manual IS NOT NULL AND deleted_at IS NULL
  ) AS por_codigo WHERE posicao > 1
  UNION
  SELECT id, tenant_id, pedido_id FROM (
    SELECT id, tenant_id, pedido_id,
           row_number() OVER (
             PARTITION BY tenant_id, pedido_id, produto_id ORDER BY id
           ) AS posicao
      FROM public.itens_pedido
     WHERE produto_id IS NOT NULL AND deleted_at IS NULL
  ) AS por_produto WHERE posicao > 1;

-- Foto da linha condenada some junto, com o mesmo tratamento de
-- `softDeleteOrderItem`: conteúdo zerado e backend 'purgado' (o CHECK
-- `pedido_item_fotos_storage_check` exige o par).
UPDATE public.pedido_item_fotos AS f
   SET conteudo = NULL, storage_backend = 'purgado',
       deleted_at = now(), version = version + 1
  FROM itens_duplicados_0044 AS d
 WHERE f.tenant_id = d.tenant_id AND f.item_pedido_id = d.id AND f.deleted_at IS NULL;

UPDATE public.itens_pedido AS i
   SET deleted_at = now(), version = version + 1
  FROM itens_duplicados_0044 AS d
 WHERE i.id = d.id AND i.deleted_at IS NULL;

-- O cabeçalho ficaria com o total das linhas apagadas. Soma só os itens vivos —
-- `total_item`/`total_com_imposto` já são derivados gravados, não há aritmética a
-- refazer aqui (`recomputeOrderTotals` cuida disso nas escritas normais).
UPDATE public.pedidos AS p
   SET total_sem_imposto = COALESCE(vivos.sem_imposto, 0),
       total_com_imposto = COALESCE(vivos.com_imposto, 0),
       version = version + 1
  FROM (SELECT DISTINCT tenant_id, pedido_id FROM itens_duplicados_0044) AS afetados
  LEFT JOIN LATERAL (
    SELECT sum(i.total_item) AS sem_imposto, sum(i.total_com_imposto) AS com_imposto
      FROM public.itens_pedido i
     WHERE i.tenant_id = afetados.tenant_id AND i.pedido_id = afetados.pedido_id
       AND i.deleted_at IS NULL
  ) AS vivos ON true
 WHERE p.tenant_id = afetados.tenant_id AND p.id = afetados.pedido_id;

DROP TABLE itens_duplicados_0044;

CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_pedido_codigo_manual
  ON public.itens_pedido (tenant_id, pedido_id, codigo_manual)
  WHERE codigo_manual IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_itens_pedido_produto
  ON public.itens_pedido (tenant_id, pedido_id, produto_id)
  WHERE produto_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_itens_pedido_codigo_manual IS
  'Código digitado único dentro do pedido, entre os itens ativos. O cruzamento com produtos.codigo é da guarda de aplicação — índice não cruza tabela.';

COMMENT ON INDEX public.uq_itens_pedido_produto IS
  'Produto do catálogo aparece no máximo uma vez por pedido, entre os itens ativos. Pega o item vindo do sync sem codigo_manual.';
