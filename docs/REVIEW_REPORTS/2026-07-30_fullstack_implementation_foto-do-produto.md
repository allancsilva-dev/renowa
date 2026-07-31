# A foto passou a ser do PRODUTO, não do pedido — 2026-07-30 (parte 6)

**Data:** 2026-07-30 · **Repo:** `renowa`, branch `master`
**Escopo:** trocar a origem da foto impressa na linha do item do papel: ela deixa de ser anexo do **pedido** e passa a ser atributo do **produto do catálogo** — uma foto por produto, reaproveitada por todo pedido que use aquele produto.
**Nada foi commitado.** Tudo no working tree, junto do que já estava das partes 3, 4 e 5.

**Estado de entrada:** [2026-07-30_fullstack_implementation_foto-na-linha-do-item.md](2026-07-30_fullstack_implementation_foto-na-linha-do-item.md) (parte 4) tinha acabado de entregar a foto na linha do item, escolhida por pedido, com a migration `0039`. **Esta rodada substitui a parte B daquele relatório**: o papel continua igual, a origem da imagem é que mudou. A `0039` nunca chegou a ser commitada e foi **removida do repo** aqui.

---

## O que mudou, em uma frase

Cadastra-se **uma** foto por produto, e todo pedido que use aquele produto imprime a mesma imagem na linha do item do papel. **O layout do papel não mudou** — a coluna FOTO, as larguras e o código acima da imagem são os mesmos da parte 4.

## Decisões do usuário (todas explícitas)

1. **A foto mora no cadastro de Produto, uma por produto.** Some toda a máquina de "várias fotos, escolha uma": auto-vínculo por nome de arquivo (`codigo_vinculo`), `usar_no_papel`, revinculação manual na tela e o teto de 10 fotos por pedido.
2. **O painel/aba de fotos do pedido é removido**, com os dados migrados.
3. **Pedido externo perde as fotos do papel.** Ele não tem itens, logo não tem produto de onde puxar imagem. Aceito.
4. **Item manual (`produto_id` nulo) imprime célula de foto vazia**, sem aviso na tela.
5. **`pedido_fotos` é migrada e DROPADA na mesma migration** — perda irreversível de foto solta, foto de item manual e foto de pedido externo.

---

## Backend

### Migration `0040_produto_fotos.sql` (nova)

Cria `public.produto_fotos` com o mesmo esqueleto de `VersionedBaseEntity` da `0034` (binário em `bytea` no próprio Postgres, `storage_backend`/`storage_key` deixando a porta aberta para bucket):

- CHECKs `produto_fotos_mime_type_check` (whitelist JPEG/PNG/WebP — SVG fora de propósito, XML executável), `produto_fotos_tamanho_bytes_check` (`> 0` e `<= 3145728`), `produto_fotos_storage_backend_check` (`db` | `r2` | `purgado`) e `produto_fotos_storage_check` (exatamente um destino preenchido, coerente com o backend declarado).
- Índice único **parcial** `uq_produto_fotos_produto (tenant_id, produto_id) WHERE deleted_at IS NULL` — uma foto ativa por produto. Parcial pelo mesmo motivo de `uq_pedido_fotos_papel_item` e `uq_chamados_sac_tenant_numero_active`: foto excluída não pode reservar a vaga para sempre, e **trocar a foto é excluir a antiga e inserir outra**.
- Índices `uq_produto_fotos_tenant_id_id`, `uq_produto_fotos_tenant_id_uuid`, `idx_produto_fotos_tenant_updated`, `idx_produto_fotos_tenant_deleted`.
- FKs compostas de tenant `fk_produto_fotos_tenant_produto` → `produtos (tenant_id, id)` e `fk_produto_fotos_tenant_pedido_origem` → `pedidos (tenant_id, id)`, criadas já validadas (tabela nova e vazia).
- Trigger `trg_produto_fotos_updated_at` (contrato de `0020`: `updated_at` é autoridade do banco).

**Tabela separada, e não coluna em `produtos`.** O trigger de sync da `0008` serializa a linha inteira com `to_jsonb(NEW)` no change feed: um `bytea` em `produtos` entraria no payload de **todo pull do mobile**. A tabela separada também mantém o binário fora de qualquer listagem de catálogo.

**Migração do dado.** `DISTINCT ON (f.tenant_id, i.produto_id)` sobre `pedido_fotos JOIN itens_pedido`, desempate por `f.created_at DESC`; ficam de fora soft-deletadas, purgadas pelo ERASURE (`storage_backend = 'purgado'`, cujo `conteudo` é NULL — reinserir violaria o CHECK e ressuscitaria dado que a LGPD mandou apagar), fotos soltas e fotos de item manual. Em seguida, `DROP TABLE public.pedido_fotos`, tudo dentro de um `DO $$ … IF EXISTS (pg_tables …)` — instalação nova não tem o que migrar nem o que dropar.

**O desempate NÃO usa `usar_no_papel`**, que seria a preferência natural. Aquela coluna veio da `0039`, que **nunca foi commitada** e foi removida do repo nesta rodada: referenciá-la faria a migration explodir em qualquer banco que tenha `pedido_fotos` da `0034` sem a coluna.

**`origem_pedido_id`** nasce NULL em foto de catálogo e é preenchida **só** pela migração. Ela existe para que o ERASURE da LGPD continue alcançando a foto migrada, que veio de um pedido e pode carregar documento de cliente no pixel.

### Código novo

- `backend/src/common/images/image-validation.ts` — magic bytes + teto de 3 MB, extraídos do serviço removido (`MAX_PHOTO_SIZE_BYTES`, `validateImageUpload`).
- `backend/src/products/entities/product-photo.entity.ts`, `product-photos.service.ts`, `product-photos.controller.ts`.
- `backend/src/orders/order-item-photos.service.ts`, `order-item-photos.controller.ts`.

### Rotas (5)

| Rota | Permissão |
|---|---|
| `GET /produtos/:uuid/foto` (metadados, `null` se não há) | `produtos.ver` |
| `PUT /produtos/:uuid/foto` (upload, `@Throttle` 30/min) | `produtos.editar` |
| `GET /produtos/:uuid/foto/conteudo` (bytes) | `produtos.ver` |
| `DELETE /produtos/:uuid/foto` (`?version=`) | `produtos.editar` |
| `GET /pedidos/:uuid/itens/:itemUuid/foto` (bytes, para o papel) | `pedidos.ver` |

`PUT` e não `POST` porque a operação é **idempotente por produto**: subir de novo substitui, não acumula.

**Por que a quinta rota existe.** `PermissionGuard` combina permissões com `every` (AND) e não tem OR: um perfil com `pedidos.ver` sem `produtos.ver` emitiria o papel **sem foto nenhuma**, e sem descobrir por quê. Ela também **recorta por pedido** — o item tem de pertencer ao pedido da rota, o pedido passa pelo mesmo ownership de vendedor do módulo (`order-ownership.ts`), e pedido de outro vendedor devolve **404 e nunca 403**. Sem esse recorte, `pedidos.ver` viraria licença para varrer o catálogo inteiro.

### Ciclo de vida do binário

Trocar ou remover a foto **zera os bytes** (`conteudo = NULL`, `storage_key = NULL`, `storage_backend = 'purgado'`) e faz soft delete da linha: a linha fica como prova de que houve anexo, sem acumular megabytes a cada troca. `upsert` roda em transação com `SELECT id FROM produtos … FOR UPDATE`; o índice parcial é a trava final se as escritas ainda se cruzarem. `remove` confere `version` por `optimisticSoftDelete` **antes** de zerar — quem clicou em remover viu uma foto, e se outra aba trocou a imagem no meio o 409 é o certo. `ProductsService.remove` chama `removeByProductId`: sem isso o índice parcial guardaria a vaga de um produto que não existe mais.

### Removidos

`backend/src/orders/order-photos.controller.ts`, `order-photos.service.ts`, `order-photos.service.spec.ts`, `entities/order-photo.entity.ts` e `backend/src/database/migrations/0039_pedido_foto_no_papel.sql`.

**`orders.service.remove()` perdeu a cascata de soft delete para `pedido_fotos`** — metade do que BACKLOG-0055 tinha fechado. Não é regressão: o objeto sumiu. A **transação** permanece, porque ela também fecha o TOCTOU entre `countNotasAtivas` e o soft delete do pedido (a metade do SAC, `itens_chamado_sac`, segue intacta).

### Ajustes de registro

- `backend/src/privacy/pii-registry.ts`: a entrada de `pedido_fotos` virou entrada de **`produto_fotos`**, com vínculo `via origem_pedido_id IN (SELECT id FROM pedidos WHERE tenant_id = $1 AND cliente_id = $2)`. Mesmas colunas e estratégia (`conteudo → NULL`, `storage_backend → 'purgado'`, `storage_key → NULL`, `nome_arquivo → marcador`, soft delete, bump de `version`).
- `backend/src/database/verify-schema.ts`: os quatro CHECKs, o índice parcial e `TABELAS_ESPERADAS` trocados de `pedido_fotos` para `produto_fotos`.

---

## Frontend

**Novos:** `services/productPhotos.service.ts`; `components/products/ProductPhotoField.tsx` (+ `.spec.tsx`); `lib/orderItemPhotos.ts` (+ `.test.ts`) com `itensComProdutoDistinto`, que **deduplica por produto** — dois itens do mesmo produto compartilham a imagem e não podem virar dois downloads.

**Alterados:**

- `ProdutoForm.tsx` ganhou o campo Foto. Na **criação** o arquivo fica em memória e só sobe depois do POST (enviar antes criaria foto órfã se o save falhasse); falha no upload não desfaz o save — o usuário reenvia pela edição.
- `PedidoDetalhe.tsx` baixa **uma imagem por produto distinto**, pela rota escopada ao pedido, e falha de download não impede a emissão do papel.
- `OrderValidationPdf.tsx` trocou a prop `fotos: OrderPdfPhoto[]` por **`fotosPorProduto: Record<produtoUuid, dataUrl>`**. Layout, larguras e a coluna FOTO **intactos**; a seção "Fotos" em grade do pedido externo saiu.

**Removidos:** `components/orders/OrderPhotosPanel.tsx` (+ teste), `services/orderPhotos.service.ts`, `lib/orderPaperPhotos.ts` (+ teste), o bloco `pendingPhotos` de `PedidoForm.tsx` e o tipo `OrderPhoto` (entrou `ProductPhoto`).

A guarda do **FIX-0008** (laço infinito de requisições) foi transposta para `ProductPhotoField` como `useRef<Set<string>>` de uuids já buscados. A afordância **"Tentar de novo"** do FIX-0022 **não** foi transposta: o campo mostra "Não foi possível carregar a foto." e não oferece repetir (BACKLOG-0078).

---

## Verificação executada

**Estático.** `build`, `lint` e `test` limpos nos dois workspaces: backend **564 passed, 1 skipped** (53 suítes; o número informado como partida desta rodada foi **535**); frontend **85 passed** (13 arquivos).

> Nota de rastreabilidade: a parte 5 registrou backend **565** (51 suítes) e frontend **88** (13 arquivos). A divergência entre 565 e o "535 antes" informado aqui **não foi conciliada** nesta rodada — o valor pós-rodada (564/85) é o que foi medido e é o que vale.

**Banco.** `db:migrate` aplicou a `0040` no banco de dev. `db:verify` → **"schema íntegro, nenhum drift"**, com índices parciais **8/8** e triggers **22/22**.

**Pré-voo do banco de dev, antes do DROP.** 1 foto viva, vinculada a item **manual** (`produto_id` nulo) → **0 migradas**, exatamente como a conferência da migration previa. Dump `pg_dump -t public.pedido_fotos` guardado **fora do repo** antes do DROP. Depois de aplicar, `to_regclass('public.pedido_fotos')` é **NULL**.

**Invariantes de banco, com SQL direto em transação revertida** (a suíte é mock puro e não prova invariante de banco):

| Tentativa | Resultado |
|---|---|
| duas fotos ativas no mesmo produto | `duplicate key value violates unique constraint "uq_produto_fotos_produto"` |
| mime fora da whitelist | violação de `produto_fotos_mime_type_check` |
| `tamanho_bytes` acima de 3 MB | violação de `produto_fotos_tamanho_bytes_check` |
| linha `'db'` sem `conteudo` | violação de `produto_fotos_storage_check` |
| soft delete da primeira + inserir a segunda | aceito — a vaga é liberada |
| `tenant_id` alheio | `violates foreign key constraint "fk_produto_fotos_tenant_produto"` |

**Boot do backend.** Os 5 endpoints novos aparecem no mapa de rotas do Nest e a aplicação sobe — a DI entre `OrdersModule` e `ProductsModule` está sã.

---

## O que NÃO foi verificado

Registrado como **pendência**, não como feito:

- **Nenhum teste de runtime em navegador.** Não houve upload real de foto em produto, nem emissão de papel com foto, nem conferência do PDF com `pdftotext`/`pdfimages`, nem o caso do perfil com `pedidos.ver` **sem** `produtos.ver`. O roteiro `ops/qa-safari` exige aba logada do Safari, que é do usuário. → BACKLOG-0073.
- **`ops/qa-safari/phases.js` ainda descreve o fluxo antigo** (fases P7/P7b: upload no pedido, auto-vínculo por nome, rádio "Usar no papel", `GET /pedidos/:uuid/fotos`). → BACKLOG-0074.
- **Isolamento entre tenants não exercitado em runtime** — a FK composta foi provada por SQL, o caminho HTTP não.

---

## Riscos

1. **Perda de dado irreversível no DROP.** Mitigada em dev por dump; **em produção exige dump antes**, e a contagem do que se perde está no cabeçalho da própria migration. → BACKLOG-0075 (P0).
2. **Foto compartilhada.** Trocar a foto de um produto muda o papel de **todos** os pedidos que o usam, **inclusive os já emitidos** — comportamento diferente do anterior, em que a foto pertencia ao pedido. Não há versionamento nem congelamento da imagem por emissão.
3. **Foto de catálogo está fora do expurgo por cliente.** Ela nasce sem `origem_pedido_id`, e o ERASURE só alcança as **migradas**. Se alguém subir documento de cliente como foto de produto, a LGPD não a alcança. O texto na tela hoje diz apenas "Aparece na linha deste produto no papel de todo pedido que o usar. Uma foto por produto." → [PROB-0083](../PROBLEM_LEDGER.md) e BACKLOG-0077.
4. **Regressão de afordância:** a miniatura que falha não oferece mais "Tentar de novo" (FIX-0022 perdeu o objeto). → BACKLOG-0078.

## Itens de backlog afetados

- **BACKLOG-0063** (foto escolhida na linha do item) — **solução substituída**: a escolha por pedido deixou de existir; o resultado no papel foi preservado.
- **BACKLOG-0058** (painel de fotos no pedido externo) — **obsoleto**: o painel não existe mais e o externo não imprime foto.
- **BACKLOG-0055** (cascata de soft delete das fotos) — a metade de `pedido_fotos` perdeu o objeto; a de `itens_chamado_sac` segue válida.
- **BACKLOG-0051** (fotos para bucket) — o objeto passou a ser `produto_fotos`; o teto de 10 por pedido não existe mais.
- **Novos:** BACKLOG-0073 (verificação em runtime), BACKLOG-0074 (`phases.js`), BACKLOG-0075 (gate de deploy da `0040`), BACKLOG-0076 (miniatura na lista de produtos), BACKLOG-0077 (aviso de LGPD no campo Foto), BACKLOG-0078 ("Tentar de novo").

## Status final

**PASS_COM_RESSALVA** — verde em build/lint/testes nos dois workspaces, migration aplicada com `db:verify` limpo e invariantes de banco exercitadas contra PostgreSQL real; **nenhuma verificação em navegador**, e a perda de dado do DROP em produção depende de um gate humano que ainda não existe.
