-- PROB-0075 (LGPD) + forma do pedido externo.
--
-- Três CHECKs mudam. Os dois primeiros abrem espaço para a purga de fotos; o
-- terceiro fecha um buraco na forma do pedido de origem externa.
--
-- (1)+(2) `pedido_fotos` ganha o backend 'purgado'. O ERASURE precisa apagar o
-- `bytea` — uma foto de nota fiscal traz nome, CNPJ e endereço no próprio pixel
-- e sobrevivia intacta a um apagamento concluído com sucesso. Sem um terceiro
-- valor, zerar `conteudo` viola `pedido_fotos_storage_check`, que exige destino
-- preenchido coerente com o backend. Purgar não é o mesmo que não ter foto: a
-- linha fica como prova de que existiu um anexo, sem o conteúdo.
-- DELETE físico foi descartado — apagaria a trilha; relaxar o predicado também,
-- porque devolveria a foto fantasma que o CHECK existe para impedir.
--
-- (3) `pedidos_origem_externa_check` passa a exigir
-- `total_sem_imposto = total_com_imposto` no ramo externo. Pedido externo não
-- tem itens: os dois totais são o mesmo valor declarado, e é isso que
-- `createExternal`/`updateExternal` gravam. Sem o CHECK, um push de sync ou um
-- chamador futuro podia dessincronizar os dois e o pedido entrava na fila de
-- faturamento com divergência silenciosa contra a nota. O gate correspondente
-- no sync está em `sync-entity-policy.ts` (PROB-0074).
--
-- Recriado NOT VALID pelo mesmo motivo da 0033: isenta legado do full scan e
-- barra escrita nova imediatamente.
--
-- Segurança de aplicação: `pedido_fotos` está vazia em todo ambiente conhecido
-- e não há linha `origem = 'externo'` (dev estava em 0032, sem a coluna).
-- Antes de aplicar em PRODUÇÃO, conferir lá e registrar o resultado:
--   SELECT name, checksum FROM public.schema_migrations ORDER BY name DESC LIMIT 5;
--   SELECT count(*) FROM pedidos WHERE origem = 'externo';
--   SELECT count(*) FROM pedidos
--    WHERE origem = 'externo' AND total_sem_imposto IS DISTINCT FROM total_com_imposto;
-- Se a última contagem for > 0, PARE: a igualdade deixa de ser reescrita segura
-- e vira decisão de negócio sobre dado existente.

-- (1) Terceiro estado do backend de storage.
ALTER TABLE public.pedido_fotos
  DROP CONSTRAINT IF EXISTS pedido_fotos_storage_backend_check;
ALTER TABLE public.pedido_fotos
  ADD CONSTRAINT pedido_fotos_storage_backend_check
  CHECK (storage_backend IN ('db', 'r2', 'purgado'));

-- (2) Coerência do destino, agora com o ramo purgado: nenhum destino preenchido.
ALTER TABLE public.pedido_fotos
  DROP CONSTRAINT IF EXISTS pedido_fotos_storage_check;
ALTER TABLE public.pedido_fotos
  ADD CONSTRAINT pedido_fotos_storage_check
  CHECK (
    (storage_backend = 'db' AND conteudo IS NOT NULL AND storage_key IS NULL)
    OR
    (storage_backend = 'r2' AND storage_key IS NOT NULL AND conteudo IS NULL)
    OR
    (storage_backend = 'purgado' AND conteudo IS NULL AND storage_key IS NULL)
  );

-- (3) Totais do pedido externo passam a ser obrigatoriamente iguais.
ALTER TABLE public.pedidos
  DROP CONSTRAINT IF EXISTS pedidos_origem_externa_check;
ALTER TABLE public.pedidos
  ADD CONSTRAINT pedidos_origem_externa_check
  CHECK (
    (origem = 'externo'
      AND numero_pedido_externo IS NOT NULL
      AND sistema_origem IS NOT NULL
      AND total_com_imposto IS NOT NULL
      AND total_sem_imposto = total_com_imposto)
    OR
    (origem = 'interno'
      AND numero_pedido_externo IS NULL
      AND sistema_origem IS NULL)
  )
  NOT VALID;
