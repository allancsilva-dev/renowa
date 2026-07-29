# Implementação — Fotos no pedido · Pedido externo · Módulo SAC

- **Data:** 2026-07-29
- **Tipo:** implementação (3 frentes de negócio)
- **Escopo:** backend + frontend + shared. `mobile/` **não tocado** (restrição de `AGENTS.md`).
- **Estado de commit:** **nada commitado — tudo no working tree** no momento deste registro.
- **Migrations novas:** `0033_pedido_origem_externa.sql`, `0034_pedido_fotos.sql`, `0035_sac_chamados.sql`.

---

## 1. Pedido externo (`0033`)

Registrar no sistema pedidos digitados em sistemas de terceiros: fornecedor e cliente
continuam sendo cadastros do Renowa; no lugar dos itens entram número do pedido de
origem, nome do sistema e valor.

**Decisão estrutural:** mesma tabela `pedidos`, com flag `origem` (`'interno'|'externo'`),
mais `numero_pedido_externo` e `sistema_origem`. Consome a **mesma** `pedidos_numero_seq`.

Consequência deliberada e verificada: o pedido externo herda o ciclo comercial inteiro
sem nenhuma alteração em `FaturamentoService` — `createExternal` grava
`total_sem_imposto = total_com_imposto = valor`, e é exatamente esse campo que a fila de
faturamento, a divergência, o `recalculateOrderStatus` e a geração de comissão já leem
(`o.total_com_imposto ?? o.total_sem_imposto`). Liberar, cancelar, excluir e faturar usam
as rotas já existentes.

**Invariantes adicionadas**

- CHECK `pedidos_origem_check` — enum de origem.
- CHECK `pedidos_origem_externa_check` (`NOT VALID`) — a forma do pedido depende da origem:
  externo exige número de origem, sistema e `total_com_imposto`; interno exige os dois
  primeiros nulos. Sem isso, um pedido externo sem valor entraria na fila de faturamento
  com divergência igual ao total da nota.
- **Guarda cruzada de rota** (`OrdersService.assertOrigem`): `PUT /pedidos/:uuid` recusa
  pedido externo com 409 e `PUT /pedidos/externos/:uuid` recusa pedido interno. Sem ela, o
  form errado apagaria número/sistema de origem e zeraria os totais — ou sobrescreveria os
  totais derivados dos itens.
- `origem`/`numero_pedido_externo`/`sistema_origem` ficam **fora** de `writableFields` em
  `sync-entity-policy.ts`, e `origem` entra em `serverControlledFields`: o mobile não cria
  pedido externo nem converte a origem de um pedido.

**Endpoints:** `POST /pedidos/externos` (`pedidos.criar`), `PUT /pedidos/externos/:uuid`
(`pedidos.editar`). Filtro `?origem=` em `GET /pedidos`; a busca passa a cobrir
`numero_pedido_externo` e `sistema_origem`.

**Frontend:** `pages/PedidoExternoForm.tsx`, rotas `/pedidos/externo/novo` e
`/pedidos/externo/:uuid/editar`, menu "Novo Pedido" com as duas origens, coluna/filtro
Origem na listagem, bloco de origem no detalhe e variante do PDF sem tabela de itens.

## 2. Fotos no pedido (`0034`)

Anexar imagens ao pedido, com vínculo automático ao item pelo **nome do arquivo**.

**Decisão de storage: `bytea` no PostgreSQL**, não bucket externo. Justificativa registrada
no cabeçalho da migration:

- o repositório **não tem nenhuma infra de binário** (sem S3/R2/MinIO/volume; o único
  upload existente é CSV em memória, buffer descartado). Bucket significaria credencial,
  CORS, lifecycle e um caminho de expurgo próprio;
- a foto entra no mesmo backup e na mesma transação do pedido que ela documenta, então
  soft delete e purga LGPD já a cobrem sem job externo;
  > **CORRIGIDO em 2026-07-29 (PROB-0075).** Esta frase era falsa quando escrita. Estar
  > na mesma transação garante atomicidade da escrita, não cobertura pelo apagamento:
  > `privacy.service.ts` era uma sequência de `UPDATE` literais que nunca citou
  > `pedido_fotos`, e o `bytea` sobrevivia intacto a um ERASURE concluído com sucesso.
  > Passou a ser verdade com a migration `0037` (backend `purgado`) e o registro
  > executável `backend/src/privacy/pii-registry.ts`. O cabeçalho da própria `0034`
  > **não** foi corrigido de propósito: ela já está aplicada e reescrever o arquivo
  > mudaria seu checksum, re-disparando o bloqueio do PROB-0072.
- `bytea` grande vai para TOAST fora da heap — não pesa nas listagens de `pedidos`.

Custo mitigado por downscale no cliente (1600px / JPEG q=0.82), teto de 3 MB por foto
(CHECK no banco) e 10 fotos por pedido. As colunas `storage_backend`/`storage_key` já
existem para permitir migrar a bucket depois **sem migrar dado**: linhas novas nascem com
`'r2'` e as antigas seguem válidas em `'db'`.

**Invariantes adicionadas**

- CHECK `pedido_fotos_mime_type_check` — só `image/jpeg`, `image/png`, `image/webp`.
  **SVG fica fora de propósito**: é XML executável e servi-lo inline é vetor de XSS.
- CHECK `pedido_fotos_tamanho_bytes_check` — `> 0 AND <= 3145728`.
- CHECK `pedido_fotos_storage_check` — exatamente um destino preenchido, coerente com
  `storage_backend`. Sem ele, uma linha `'db'` sem `conteudo` vira foto fantasma: aparece
  na listagem e só falha na hora de montar o PDF.
- **Validação por magic bytes** (`OrderPhotosService.detectMimeType`), não pelo `mimetype`
  do multipart — esse é escolhido pelo cliente e não prova nada.
- Upload bloqueado (409) em pedido fora de `em_aberto`.

**Auto-vínculo:** `normalizePhotoCode` normaliza o basename e compara com
`itens_pedido.codigo_manual` e `produtos.codigo` dos itens ativos. **Só vincula em match
único** — código ambíguo deixa a foto no pedido, porque um vínculo errado passa
despercebido enquanto um "não vinculado" o usuário corrige na tela.

**Ownership:** `isVendorOnly`/`vendorOwnershipWhere` foram extraídos de `OrdersService`
para `orders/order-ownership.ts` e são reusados pelo serviço de fotos. Duplicar essa
condição é como o IDOR volta.

**Endpoints:** `POST|GET /pedidos/:uuid/fotos`, `GET /pedidos/:uuid/fotos/:fotoUuid/conteudo`,
`DELETE /pedidos/:uuid/fotos/:fotoUuid`.

**Frontend:** `lib/imageDownscale.ts`, `services/orderPhotos.service.ts`,
`components/orders/OrderPhotosPanel.tsx`; painel no detalhe e no form de edição; na
**criação** os arquivos ficam em memória e só sobem depois que o POST devolve o uuid
(evita foto órfã se o save falhar). As fotos entram no PDF embutidas como data URL.

## 3. Módulo SAC (`0035`)

Abertura de chamado com numeração sequencial própria e papel impresso.

**Decisão estrutural:** módulo próprio (`backend/src/sac/`), tabelas `chamados_sac` +
`itens_chamado_sac`, sequence `sac_numero_seq` própria. **Fora do faturamento e da
comissão** — decisão do usuário. Misturar chamado com receita poluiria a fila de
faturamento e os relatórios de caixa.

Layout confirmado pelo usuário via print "SAC RENOWA": cabeçalho com
DADOS DO CLIENTE / FORNECEDOR / NUMERO DE NFE, tabela
COD · QUANT · MOTIVO · VL UNI. (NF) · VL. TOTAL NF, e linha TOTAL. Ou seja, o chamado é
**pai + itens**, com a mesma forma de `pedidos` + `itens_pedido`.

**"Importador" = fornecedor.** Confirmado com o usuário: não existe entidade "importador"
no Renowa e nenhuma foi criada; o campo FORNECEDOR do formulário aponta para `fornecedores`.

**Ciclo de vida:** `aberto → em_andamento → resolvido | cancelado`. Resolvido e cancelado
são **terminais** — reabrir exige abrir outro chamado, senão o histórico de atendimento
fica ambíguo. `status` não é campo de entrada: transição só por `PATCH /sac/:uuid/status`,
que valida o caminho (mesma disciplina de `pedidos.liberar`).

**Cálculo:** `backend/src/sac/sac-calculation.ts` (fonte de verdade) e
`frontend/src/lib/sacCalculation.ts` (preview), com os **mesmos casos de teste dos dois
lados** — se o preview divergir do servidor, o usuário vê um total na tela e outro no papel.
O valor unitário é arredondado **antes** de multiplicar, e o total soma valores já
arredondados: é o que está impresso na coluna VL. TOTAL NF que precisa fechar com o TOTAL
do rodapé.

**Permissões:** 4 slugs novos (`sac.ver|criar|editar|deletar`), concedidos só a
`admin`/`gestao`. Catálogo em `shared/src/permissions/catalog.ts` (28 → **32** slugs) +
seed na migration. `vendedor` e `financeiro` **não** recebem SAC por provisionamento
automático — é decisão de negócio a ser feita pela tela de Perfis.

**Frontend:** `pages/Sac.tsx`, `SacForm.tsx`, `SacDetalhe.tsx`,
`components/sac/SacTicketPdf.tsx` (fiel ao print, com "Nº ABERTURA SAC" no topo), item na
sidebar com `permission: 'sac.ver'` e rota com `<ProtectedRoute permission='sac.ver'>` —
mesmo padrão que hoje só `/faturamento` usava.

---

## 4. Defeitos encontrados durante a implementação

### 4.1 Auto-vínculo de foto ligava ao item ERRADO (achado por teste)

A primeira versão de `normalizePhotoCode` removia sufixos `-1`/`_2` para tolerar cópias, e
com isso comia o final de códigos legítimos: `ABC-123.jpg` normalizava para `ABC`. Resultado
seria vincular a foto ao item errado silenciosamente. Regra removida; só o sufixo `(n)` do
sistema operacional (inequívoco) é tratado. Guarda de regressão em
`order-photos.service.spec.ts`.

### 4.2 `apiClient` corromperia binário

`frontend/src/lib/apiClient.ts` é fetch-based e sempre fazia `res.text()` + `JSON.parse`.
Uma imagem passaria por `res.text()` e chegaria corrompida. `request` foi decomposto em
`send` (auth + timeout + abort) + leitores distintos, e foi adicionado `apiClient.getBlob`.

### 4.3 `itens_pedido` sem `UNIQUE(tenant_id, id)` — **só apareceu contra PostgreSQL real**

A FK composta de `pedido_fotos` para `itens_pedido (tenant_id, id)` falhava com
"there is no unique constraint matching given keys". `itens_pedido` é anterior ao padrão de
`0021` e só tinha `UNIQUE(tenant_id, uuid)`. A migration `0034` passa a criar
`uq_itens_pedido_tenant_id_id` antes da FK.

**Este é o achado mais relevante da rodada em termos de processo:** a suíte de testes é
100% mock e jamais o pegaria. Ver PROB-0072 e BACKLOG-0048 — outras tabelas pré-`0021`
podem ter a mesma lacuna.

### 4.4 Erro de lint preexistente bloqueando o gate do frontend

`frontend/src/lib/csvTemplate.ts:21` tinha o BOM `U+FEFF` como caractere literal no template
string, disparando `no-irregular-whitespace` e derrubando `npm run lint --workspace=frontend`
inteiro. Preexistente (introduzido em `59b77f6`), **fora do escopo pedido**, corrigido para
o escape `\uFEFF` porque sem isso não havia como reportar lint limpo.

---

## 5. Validação executada

| Gate | Resultado |
|---|---|
| `npm run lint --workspace=backend` | limpo |
| `npm run build --workspace=backend` | limpo |
| `npm test --workspace=backend` | **405 passaram**, 1 skipped, 48 suítes |
| `npm test --workspace=shared` | 9 passaram |
| `npm run lint --workspace=frontend` | limpo |
| `npm run build --workspace=frontend` | limpo |
| `npm run test --workspace=frontend` | 43 passaram, 10 arquivos |

**Contra PostgreSQL real** (15.18) — em banco descartável `renowa_verify`, criado e
apagado; o banco de dev **não foi tocado** (ver PROB-0072):

- `db:migrate` aplicou `0033`, `0034` e `0035`.
- `db:verify`: **27/27 tabelas · 33/33 CHECKs · 6/6 índices únicos parciais ·
  21/21 triggers de `updated_at`. Nenhum drift.**
- Smoke SQL direto das constraints novas: `pedido_fotos_storage_check` rejeitou linha `'db'`
  sem `conteudo`; `pedido_fotos_mime_type_check` rejeitou `image/svg+xml`;
  `chamados_sac_status_check` rejeitou `'faturado'`. `sac_numero_seq` incrementa.

**Não validado:** fluxo ponta a ponta pela UI (criar pedido com fotos, gerar PDF, abrir
chamado) — o banco de dev está bloqueado para migrar por PROB-0072, então o app não pôde
subir com o schema novo. Testes de frontend cobrem os utilitários, não as telas.

## 6. Testes novos

- `backend/src/orders/orders.service.spec.ts` — pedido externo: mesma sequence, dois totais
  gravados, guarda cruzada nos dois PUTs, bloqueio fora de `em_aberto`, DTO recusando
  `status`/`origem`/`itens`/totais.
- `backend/src/orders/order-photos.service.spec.ts` — auto-vínculo (único/ambíguo/sem match),
  preservação de sufixo numérico, rejeição por magic bytes divergentes, SVG, teto por pedido,
  pedido liberado, isolamento de vendedor.
- `backend/src/common/interceptors/response.interceptor.spec.ts` — `StreamableFile` passa sem
  envelope `{ data }`.
- `backend/src/sac/sac-calculation.spec.ts` e `sac.service.spec.ts` — arredondamento,
  numeração, matriz de transições válidas/inválidas, reconciliação de itens, DTO.
- `frontend/src/lib/imageDownscale.test.ts` e `sacCalculation.test.ts`.
