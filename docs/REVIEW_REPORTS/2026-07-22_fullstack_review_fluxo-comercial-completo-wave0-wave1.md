# Revisão independente + testes + Wave 0/Wave 1 de correções — commit `d91b9b3` ("feat: fluxo comercial completo")

- **Data:** 2026-07-22
- **Área:** backend / frontend / banco / segurança / infra
- **Tipo:** revisão independente pós-implementação + execução de testes + correções (Wave 0 e Wave 1)
- **Commit revisado:** `d91b9b3` — "feat: fluxo comercial completo (pedidos -> faturamento -> comissao -> caixa)"
- **Estado de commit desta sessão:** **NADA foi commitado. Tudo está no working tree.**
- **Status final:** **PASS_COM_RESSALVA**

> **Enquadramento que governa toda a severidade deste relatório: o produto vai para produção depois desta rodada.** Isso eleva a severidade de tudo que hoje é "só dev" mas **não foi verificado em produção**. Nenhuma verificação contra o banco de produção foi feita nesta sessão.

---

## Convenção de evidência usada neste relatório

Os dois níveis abaixo **não são equivalentes** e não estão homogeneizados no texto:

- **[VERIFICADO]** — leitura direta do código, query executada no banco, ou execução real de teste/comando nesta sessão.
- **[RELATO]** — achado de subagente de revisão ou inferência a partir de outro fato, **não reverificado diretamente** nesta sessão.

---

## 1. Objetivo

Revisar de forma independente o commit `d91b9b3`, rodar a suíte completa, e corrigir o que fosse bloqueador antes de o produto ir para produção.

## 2. Escopo verificado

- Suíte de testes, lint e build dos três workspaces (shared, backend, frontend).
- Estado real do schema do Postgres de dev (`renowa-dev-postgres`) contra o que as migrations declaram.
- Máquina de estados de pedido (criação, edição, liberação, cancelamento, exclusão) e sua interação com faturamento/comissão.
- Superfície de escrita: DTOs de entrada, controllers, caminho de push do sync.
- Exposição de PII no módulo de faturamento.
- Árvore de dependências de runtime (`npm audit --omit=dev`) e triagem de aplicabilidade.

**Fora do escopo (não verificado):** banco de produção, banco de staging, smoke visual em navegador, app mobile em execução.

## 3. Comandos executados (execução real)

- Suíte completa dos três workspaces, lint e build. **[VERIFICADO]**
- Queries diretas no `renowa-dev-postgres` para inventariar CHECK constraints, índices únicos parciais, triggers, FKs compostas, tabelas/funções/sequences de sync e conteúdo de `schema_migrations`. **[VERIFICADO]**
- `npm audit --omit=dev` + leitura dos ranges de cada advisory. **[VERIFICADO]**
- `grep @Entity backend/src/sync/` (retorno vazio). **[VERIFICADO]**
- Migration `0031` executada duas vezes em transação com `ROLLBACK` antes de valer. **[VERIFICADO]**
- `git status --porcelain` para confirmar que nada foi commitado. **[VERIFICADO]**

## 4. Resultado da suíte

**Números finais da sessão, depois do fechamento das três frentes da seção 8. [VERIFICADO por execução real]**

| Workspace | Baseline `d91b9b3` | Final da sessão |
|---|---|---|
| shared | 8/8 (1 suite) | **8/8** (1 suite) |
| backend | **236/236** (38 suites) | **260/260** (38 suites) — **+24** |
| frontend | 29/29 (8 arquivos) | **29/29** (8 arquivos) |

Lint **limpo** e build **ok** nos três workspaces. **[VERIFICADO]**

_Registro intermediário, mantido para rastreabilidade: no primeiro passe deste relatório o número era "total esperado 239" (`orders`+`faturamento` de 26 → 29). Os 21 testes restantes vieram do fechamento de PROB-0069/0070/0071 (encoding, separador, limite de linhas, rejeição de `.xlsx`, 12 casos de `parseImportPrice`) e da reescrita da guarda de DTO (BUG-0027)._

### Ressalva estrutural sobre a suíte (levantada pelo `quality-reviewer`, não neutralizada)

**Toda a suíte de `faturamento`/`finance`/`orders` é mock puro** (`jest.fn()` sobre repositórios). Nada roda contra Postgres. Os 236 verdes **não provam** que locks pessimistas, FKs compostas, índices únicos parciais e CHECKs funcionem. A asserção central do módulo — "duas notas concorrentes no mesmo pedido serializam" — é **inverificável** pelos testes atuais. Registrado em [BACKLOG-0028](../BACKLOG.md).

Isso interage diretamente com o achado da seção 5: as invariantes em que a suíte confia sem testar **já sumiram do banco duas vezes**.

## 5. PROB-0059 — reincidência confirmada, escopo real muito maior, resolvido em dev

**[VERIFICADO por query própria]** As 4 invariantes registradas em PROB-0059 tinham sumido **de novo**: as duas queries do ledger retornaram `(0 rows)`. Processo `nest start --watch` PID 13091 rodando desde 12:14, `NODE_ENV=development`, `app.module.ts:44-46` com `synchronize: true`.

**Correção de escopo — não eram 4 objetos.** Havia **zero CHECK constraints em todo o schema `public`**, enquanto as migrations declaram ~20. Além das 2 já registradas, também tinham sido apagadas:

- `version > 0` em `pedidos`, `financeiro_movimentacao`, `comissoes`, `parceiros_comerciais`, `inadimplencia` (`0007`) e em `notas_fiscais` (`0028`) — **base do controle de concorrência otimista**;
- `version > 0` da `0009` (`clientes`, `produtos`, `fornecedores`, `transportadoras`, `itens_pedido`);
- `itens_pedido_desconto_perc_range` e `itens_pedido_ipi_perc_range` (`0024`);
- `access_token_version > 0` (`0023`);
- enums de `lgpd_requests` (`subject_type`, `request_type`, `status`) e `action` de `pii_audit_events` (`0010`/`0011`);
- o índice único parcial `uq_lgpd_active_request` (`0011`).

### ARMADILHA — ninguém deve "só rodar a migration de novo"

**[VERIFICADO]** O `synchronize` **renomeou** as FKs compostas de `0028`/`0029` (`fk_notas_fiscais_tenant_pedido` → `FK_183ff04740a6e9633d5f305ef32`, etc.). As FKs **existem** e mantêm o par `(tenant_id, ...)` — **isolamento multi-tenant preservado** — mas os blocos `DO $$ IF NOT EXISTS (conname = 'fk_...')` daquelas migrations **perderam idempotência contra esse banco**: reexecutar aqueles arquivos criaria FK duplicada em vez de no-op.

### Correções aplicadas

1. Processo `nest start --watch` (PID 13091) encerrado.
2. `backend/src/app.module.ts` — `synchronize` passou de `DB_SYNC === 'true' || NODE_ENV !== 'production'` para **`DB_SYNC === 'true'` apenas**, com comentário no código explicando por que nunca reativar por `NODE_ENV`. Migrations SQL viram fonte de verdade em todo ambiente. `DB_SYNC` não está setado em nenhum `.env` nem compose. → BUG-0019
3. Nova migration `backend/src/database/migrations/0031_restore_schema_invariants.sql` — aditiva e **idempotente por design** (guardas em `pg_constraint`/`pg_indexes`/`pg_trigger`), para poder rodar também em produção sem falhar nem duplicar. → BUG-0020
4. Novo `backend/src/database/verify-schema.ts` + scripts `db:verify` e `db:migrate` em `backend/package.json`. → BUG-0021

**Descoberta lateral [VERIFICADO]:** **não existia script de migration nenhum** — o runner só era chamado no boot em produção (`backend/src/main.ts:13`). O `db:verify` compara **por estrutura, não por nome** (porque o `synchronize` renomeia índice para `IDX_<hash>`), é read-only, parametrizado por `DATABASE_URL`, e sai 0/1/2.

### Estado do banco de dev depois — [VERIFICADO por query própria]

`checks=20` (era 0) · as 2 constraints originais do PROB-0059 presentes · os 2 índices parciais presentes · `trg_set_updated_at` em 17 tabelas + `trg_notas_fiscais_updated_at` (nome próprio) = 18 triggers · `fk_notas=1` e `fk_comissoes=4` — **sem duplicação; a armadilha acima foi evitada**.

### Duas decisões de projeto do `database-engineer`, registradas de propósito

- As 4 constraints que nasceram `NOT VALID` **continuam `NOT VALID`**: promover a validado varre a tabela inteira e, como `runMigrations()` roda antes do `NestFactory`, uma linha histórica suja viraria **falha de boot**. É decisão separada, com janela própria.
- O guard do trigger é **por função, não por nome** — senão o bloco da `0020` renomearia `trg_notas_fiscais_updated_at`, que é legítimo.

**Status proposto e aplicado:** PROB-0059 → **FECHADO_COM_RESSALVA** (mecanismo desligado + invariantes restauradas + detector de drift criado). **A ressalva é única e explícita: produção não foi verificada.**

## 6. PROB-0060 — diagnóstico corrigido e resolvido em dev

**Correção factual ao que estava no ledger:** a função `public.set_updated_at()` **existe** — a migration `0028` a recriou com `CREATE OR REPLACE`. Faltavam **só os triggers**, restaurados pela `0031`. **Produção não verificada.** → PROB-0060 **FECHADO_COM_RESSALVA**.

## 7. Achados novos

### 7.1 PROB-0061 — infra de sync das migrations `0008`/`0009` ausente no banco de dev (HIGH, ABERTO)

**[VERIFICADO por query própria]** `sync_outbox`, `sync_changes`, `sync_mutation_inbox` = **0 tabelas**; `capture_sync_outbox`, `drain_sync_outbox` = **0 funções**; `sync_change_revision_seq` = **0**. E ainda assim `schema_migrations` tem `0008_sync_change_feed.sql` e `0009_sync_push_v2.sql` registradas como aplicadas em 2026-07-22 14:07:57.

**NÃO é o mecanismo do PROB-0059 [VERIFICADO].** Não existe nenhuma `@Entity` para essas tabelas (`grep @Entity backend/src/sync/` → vazio), e o `synchronize` do TypeORM só mexe em tabelas presentes nos seus metadados — nunca dropa tabela que desconhece. Somado ao fato de `0008`/`0009` usarem `CREATE TABLE IF NOT EXISTS` (se tivessem executado, as tabelas existiriam), a hipótese que sobra é que **`schema_migrations` foi populada sem que o SQL rodasse**. Isso bate com a nota já existente no BACKLOG sobre sanear o baseline de `schema_migrations` no banco dev legado e tem a **mesma assinatura do PROB-0060** — sugere causa comum, não coincidência.

**Impacto:** `backend/src/sync/sync.service.ts` depende dessas tabelas em SQL cru (`:72`, `:99`, `:498`, `:504`, `:512`) — **em dev, push/pull do mobile está quebrado**. **Em produção é desconhecido e precisa ser verificado antes do deploy.** Não é uma falha em produção — isso não está verificado.

**Consequência transversal:** **`schema_migrations` não é evidência confiável do que existe no banco, em nenhum ambiente.**

**Não restaurado nesta sessão por decisão deliberada:** religa trigger de escrita em 6 tabelas quentes (`clientes`, `produtos`, `fornecedores`, `transportadoras`, `pedidos`, `itens_pedido`) — é mudança de comportamento, não reparo de invariante, e aguarda decisão do usuário.

### 7.2 PROB-0062 — `status` de pedido gravável via POST/PUT (era BLOQUEADOR) — CORRIGIDO

Achado independentemente pelo `quality-reviewer` e pelo `security-auditor`, e **[VERIFICADO] por leitura direta**. `orders/dto/create-order.dto.ts:41` tinha `@IsOptional() @IsString() status?: string`, e `orders.service.ts:131` (create) e `:203` (update) faziam `status: dto.status ?? 'em_aberto'`.

Um usuário com a role padrão `vendedor` (tem `pedidos.criar`/`pedidos.editar`, **não** tem `pedidos.liberar`) mandava `{"status":"liberado"}` no POST ou PUT e contornava o endpoint dedicado criado por este mesmo commit — **a permissão nova era decorativa**. Também dava para saltar direto a `"faturado"`, fazendo o pedido sumir da fila de `GET /faturamento/pedidos` (`faturamento.service.ts:48` só lista `liberado`/`parcialmente_faturado`) sem existir nota nem comissão. `pedidos_status_check` não protegia — `liberado` é valor válido do enum. `PATCH /:uuid/status` tinha sido corretamente travado em `cancelado`, mas POST e PUT ficaram abertos.

**ARMADILHA encontrada na correção:** `frontend/src/pages/PedidoForm.tsx` fazia `...header` no payload e `header` contém `status` — o frontend mandava `status` em **todo** create/update. Com `forbidNonWhitelisted: true`, remover o campo só do DTO faria **todo save de pedido virar 400**. A correção teve obrigatoriamente que ser backend + frontend na mesma mudança.

**Correção:** campo removido do `CreateOrderDto` (e por herança do `UpdateOrderDto`); `status: 'em_aberto'` fixo no create; `status` fora do `Object.assign` do update; `const { status: _status, ...headerFields } = header;` no `PedidoForm.tsx`. → BUG-0022

### 7.3 PROB-0063 — `DELETE /pedidos/:uuid` não checava faturamento (era BLOQUEADOR) — CORRIGIDO

`orders.service.ts:304-308`: `remove()` chamava `optimisticSoftDelete` direto. `updateStatus` tinha ganhado a checagem de notas ativas; `remove()` não. Depois do soft delete do pedido, `notas_fiscais` e `comissoes` continuavam com `deleted_at IS NULL`, seguiam somando em `faturamentoBruto`/fluxo de caixa, e a nota ficava **impossível de corrigir**: `atualizarNota` e `excluirNota` faziam `orderRepo.findOne` sem `withDeleted` → 404 permanente.

**Correção:** helper `countNotasAtivas()` extraído e aplicado em `remove()` (409 quando há nota ativa) + `withDeleted: true` nos dois `findOne` de `faturamento.service.ts`, para sanear registros já órfãos. → BUG-0023

3 testes novos em `orders.service.spec.ts`, incluindo **guarda de regressão que falha se `status` voltar ao DTO**.

### 7.4 PROB-0064 — mass assignment em `PATCH /produtos` e `PATCH /transportadoras` (HIGH, ABERTO)

**[VERIFICADO por leitura direta]** `products.controller.ts:58` e `transport.controller.ts:51` usam `@Body() dto: Partial<CreateXDto>`. `Partial<T>` é **tipo TypeScript, não classe**: o `design:paramtypes` emitido é `Object`, e o `ValidationPipe` global (com `whitelist`+`forbidNonWhitelisted`) **pula metatypes nativos** — o body chega cru em `Object.assign(product, rest)` (`products.service.ts:113-114`). `tenant_id`, `id`, `deleted_at`, `created_at` são graváveis: `PATCH {"tenant_id":"<uuid-vítima>"}` move o registro para outro tenant.

**Pré-existente, fora do delta de `d91b9b3`** — mas o commit corrigiu exatamente o gêmeo disso em fornecedores (`Partial<CreateSupplierDto>` → `UpdateSupplierDto`), então sobraram dois pontos com o padrão antigo. **É a única falha identificada nesta rodada com quebra real de isolamento multi-tenant.** Correção indicada: `UpdateXDto extends PartialType(CreateXDto)`.

### 7.5 PROB-0065 — caminho de sync ignora a máquina de estados nova (HIGH, ABERTO)

**[VERIFICADO por leitura direta]** `backend/src/sync/sync-entity-policy.ts:54` mantém `status` em `writableFields` de `pedidos`, e o push escreve direto na tabela sem passar por `OrdersService`. Device pode setar `faturado` sem nota, rebaixar pedido faturado para `em_aberto` e depois editá-lo pela REST furando o bloqueio de `orders.service.ts:168`, alterar `total_com_imposto` de pedido faturado sem recálculo, ou deletar o pedido reproduzindo 7.3. Precisa de decisão de arquitetura sobre o que o mobile pode fazer offline com pedido.

**Enquanto isso não for resolvido, as correções 7.2 e 7.3 são parciais.**

### 7.6 PROB-0066 — `PATCH /financeiro/comissoes/:uuid` legado contorna a máquina de estados (MEDIUM, ABERTO)

**[RELATO]** `finance.service.ts:211-227` + `dto/create-comissao.dto.ts:50`,`:72` (`status?: string` sem `@IsIn`). Permite `status='pago'` sem `data_pagamento` (comissão "paga" que nunca entra no caixa e ainda trava `atualizarNota`/`excluirNota`) e reescrita livre de `valor_comissao`. Com `comissoes_status_check` restaurada, status fora do enum agora dá **500 em vez de 400**.

### 7.7 PROB-0067 — PII completa de cliente exposta a quem só tem `faturamento.ver` (MEDIUM, LGPD, ABERTO)

**[RELATO]** `faturamento.service.ts:88-110` devolve a entidade `Client` inteira (`cnpj`, `email`, `tel`, endereço completo, `contato`, `observacao`) via `leftJoinAndSelect`. A role padrão `financeiro` tem `faturamento.ver` mas **não** tem `clientes.ver` (`shared/src/permissions/catalog.ts:120-124`). Mesmo tenant — **não é vazamento cross-tenant** — mas contorna a granularidade de RBAC que o próprio commit reforça.

### 7.8 PROB-0068 — NestJS 10.4.22 é fim de linha (HIGH, gate de produção, ABERTO)

**[VERIFICADO]** Triagem própria de `npm audit --omit=dev`: 20 achados, **10 high**. O projeto está na **última 10.x que vai existir**; a linha de correção do ecossistema é NestJS 11 (11.1.28). O advisory do próprio `@nestjs/core` tem range `<=11.1.17` — só corrigido em 11.1.18+, ou seja, **NestJS 10 nunca vai receber**. Idem os advisories de `body-parser` e `qs`. A migração 10 → 11 precisa de item próprio **com data** ([BACKLOG-0040](../BACKLOG.md)), não pode ficar para depois do deploy.

#### Triagem de NÃO-APLICÁVEIS, com o motivo (registrada para evitar retrabalho em toda auditoria futura)

| Pacote | Motivo de não se aplicar |
|---|---|
| `typeorm` (SQLi em `orderBy`) | MySQL/MariaDB-only; o projeto é PostgreSQL |
| `uuid <11.1.1` | só falha "when `buf` is provided"; o TypeORM chama `v4` sem `buf` |
| `glob` | advisory é da CLI (`-c`/`--cmd`); o TypeORM usa como biblioteca |
| `js-yaml` | vem de `@istanbuljs/load-nyc-config` (tooling de cobertura) |
| `brace-expansion` / `picomatch` | mesma cadeia de tooling |
| `lodash` | advisory é de `_.template`; o `@nestjs/config` usa `get`/`set` |
| `file-type` | loop no parser ASF, não usado |
| `form-data` | não resolve na árvore de runtime do backend |

## 8. Wave 2 — as três frentes que estavam EM_ANDAMENTO **fecharam nesta mesma sessão**

_Esta seção foi reescrita no segundo passe de registro. Antes descrevia trabalho em curso; agora descreve o desfecho. **As três frentes estão FECHADAS** — PROB-0069, PROB-0070 e PROB-0071 — registradas em BUG-0024, BUG-0025 e BUG-0026, mais BUG-0027 (correção de um problema introduzido pela própria sessão)._

### 8.1 PROB-0069 — `xlsx` → `papaparse`, importação passa a ser só CSV — **FECHADO**

`xlsx` removido de `backend/package.json`; `papaparse@^5.5.4` (MIT, ~267 KB, **zero dependências transitivas**) no lugar; `IMPORT_ALLOWED_EXTENSIONS = ['csv']`. `normalizeImportRow`, o loop de upsert e o `ImportProductsResultDto` **ficaram intactos**. **[VERIFICADO por leitura direta]** Alternativas descartadas seguem registradas no primeiro passe e em [PROB-0069](../PROBLEM_LEDGER.md): `exceljs` (21,8 MB, parado desde 2024-12) e SheetJS via CDN (**cega o `npm audit`**).

Quatro detalhes técnicos que evitam retrabalho:

- **`import * as Papa from 'papaparse'`, nunca `import Papa from`** — o `tsconfig` tem `allowSyntheticDefaultImports` **sem** `esModuleInterop`: o default import compila e **quebra em runtime**.
- **DoS corrigido no lugar certo:** `preview: IMPORT_MAX_ROWS + 1` limita **durante** o parse. Confirmado empiricamente que, com `header: true`, o `preview` conta **linhas de dados** (header fora) — a checagem `> IMPORT_MAX_ROWS` posterior continua exata. Teste garante que 5000 linhas legítimas ainda passam.
- **`@Throttle({ default: { ttl: 60_000, limit: 5 } })`** na rota, e o `UserThrottlerGuard` é `APP_GUARD` global com chave por `user.sub` — **o limite é por usuário e vigora de fato.**
- **Encoding:** `decodeCsvBuffer` remove BOM, decodifica com `TextDecoder('utf-8', { fatal: true })` e só cai para `windows-1252` quando o buffer **comprovadamente** não é UTF-8. Usar `fatal` em vez de procurar `` é o ponto — a heurística ingênua reinterpretaria arquivo UTF-8 legítimo por engano. Separador `;` do Excel pt-BR tratado com `delimiter: ''` (auto-detecção).

**MUDANÇA DE CONTRATO com impacto em usuário real:** `.xlsx` agora recebe **400** — `'Tipo de arquivo inválido. Utilize .csv (UTF-8).'`. **Quem já importava planilha `.xlsx` perde o fluxo.** `frontend/src/pages/Produtos.tsx` foi atualizado (accept, label `(.csv)`, instrução "Salvar como > CSV UTF-8", colunas esperadas, limite de 5.000 linhas), **mas UI não substitui comunicar a mudança** — [BACKLOG-0042](../BACKLOG.md). `ImportProductsResultDto` inalterado; **mobile não consome essa rota**.

Prototype pollution via header `__proto__` no CSV foi analisada e **não é explorável** (papaparse atribui string por bracket notation; `Object.entries` só lista own props).

### 8.2 PROB-0070 — `preco_base` em pt-BR — **FECHADO**

`parseImportPrice` no lugar de `Number(preco_base.replace(',', '.'))`, com **12 casos testados**. Duas **decisões** (não detalhes) que ficam registradas:

- **`"1.234"` continua sendo lido como 1.234, não 1234.** É ambíguo e mudar isso **multiplicaria preço por mil silenciosamente**. Preservado o lado seguro do erro.
- **Gap real introduzido pela primeira versão da própria correção e fechado antes do fim:** o parser aceitava `"12,,50"` como **1250** — a regra "várias vírgulas = milhar" não validava o **agrupamento**. Passou a exigir `^-?\d{1,3}([.,]\d{3})+$`. Regex ancorada, sem quantificador aninhado — **sem ReDoS**.

### 8.3 PROB-0071 — overrides de dependência — **FECHADO**

`overrides` no `package.json` da **raiz** (npm só honra na raiz em workspaces; verificado em teste isolado), com bloco `comments` documentando o porquê de cada um e **a condição de remoção** (migração para NestJS 11). Versões efetivas confirmadas por `npm ls` e reconferidas em disco: `multer@2.2.0`, `express@4.22.2`, `body-parser@1.20.6`, `qs@6.15.3`, `path-to-regexp@0.1.13`, `typeorm@0.3.31`. **[VERIFICADO]**

**Três achados operacionais que vão morder de novo:**

1. **`npm install` NÃO aplica os overrides.** O lockfile já tinha a árvore materializada e o npm 10.9.8 não re-resolve. **Editar o lock na mão removeu `express`/`multer`/`body-parser` da árvore** — a aplicação não subiria. O que funcionou: `npm update multer express body-parser typeorm path-to-regexp`, que re-resolve só o alvo. **Deletar o `package-lock.json` foi descartado de propósito** (re-resolveria todos os `^` do expo/react-native).
2. **`body-parser` precisou de override próprio.** `@nestjs/platform-express@10.4.22` depende dele **direto e em versão exata** (`1.20.4`); o override de `express` **não alcança**.
3. **O bump de `typeorm` criou duas cópias em disco** (peer do `@nestjs/typeorm` + `backend/node_modules`). **Duas instâncias de TypeORM no mesmo processo duplicam o metadata storage e quebrariam em produção.** `npm update typeorm` deduplicou. **Conferir cópia única após qualquer `npm install` futuro** — [BACKLOG-0044](../BACKLOG.md).

**Verificação que build verde não cobre:** foi escrito um teste temporário com Nest + supertest subindo um `FileInterceptor` real — upload multipart chegou com buffer íntegro e arquivo de 6 MB recebeu **413**. **O arquivo foi removido depois; não está no diff** — candidato a guarda permanente em [BACKLOG-0043](../BACKLOG.md).

### 8.4 Gate de dependências desta rodada: **FECHADO**

`npm audit --omit=dev --workspace=backend`: **20 → 13** (critical 0, high 6, moderate 7). **[VERIFICADO por execução real]**

Os 13 restantes são **exatamente** os já triados na seção 7.8 como não-aplicáveis (`brace-expansion`, `form-data`, `glob`, `js-yaml`, `lodash`, `picomatch`) **mais** o bloco que só sai com NestJS 11 (`@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/typeorm`, `file-type`, `uuid`). **Nenhuma vulnerabilidade alcançável permanece aberta.** [BACKLOG-0040](../BACKLOG.md) (NestJS 10 → 11) é **o único caminho** para os 13 restantes.

### 8.5 Problema introduzido pela própria sessão e corrigido — BUG-0027

A guarda de regressão de PROB-0062 em `orders.service.spec.ts` usava `require('fs')` inline para ler o fonte do DTO — **quebrava `npm run lint --workspace=backend` com 2 erros `@typescript-eslint/no-var-requires`**. Substituída por teste **comportamental**, estritamente melhor: valida `CreateOrderDto`/`UpdateOrderDto` com `plainToInstance` + `validate` usando **o mesmo par de opções do `ValidationPipe` global** (`whitelist: true, forbidNonWhitelisted: true`) e assere que `status` aparece entre as propriedades rejeitadas. **De 1 teste frágil para 3.**

Duas armadilhas que afetam **qualquer** teste futuro de DTO neste repo:

- É preciso `import 'reflect-metadata';` **antes** dos imports de DTO no spec — sem isso os decorators não registram metadata e a validação vira ruído (`Reflect.getMetadata is not a function` / 23 erros espúrios).
- A constante `orderUuid` do resto do spec (`bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`) **não é UUID v4 válido** e não passa em `@IsUUID('4')` — falta o nibble de versão.

### 8.6 Riscos residuais desta frente (não omitir)

- **Nada rodou contra Postgres real.** Os testes de import usam `manager` mockado; `dataSource.transaction` + upsert não foram exercidos contra banco — é a mesma ressalva estrutural da seção 4 ([BACKLOG-0028](../BACKLOG.md)).
- **Não foi testado com arquivo real exportado do Excel pt-BR.** Os bytes foram simulados (BOM, Windows-1252, `;`), o que cobre a mecânica; um teste manual com export de verdade antes do go-live é barato — [BACKLOG-0045](../BACKLOG.md).
- **`preview` não limita memória.** O bound real continua sendo o limite de 5 MB do multer, porque o buffer inteiro é decodificado para string antes do parse; o `preview` limita o array de linhas e o loop O(n), não a string. Streaming exigiria mudar a assinatura para `Readable` — não feito ([BACKLOG-0046](../BACKLOG.md)).
- **Dados já importados antes do fix de PROB-0070 podem estar faltando produtos** — não auditado, sem backfill.

## 9. Arquivos tocados nesta sessão (todos no working tree, sem commit)

**[VERIFICADO por `git status --porcelain`]**

Modificados: `backend/package.json` · `backend/src/app.module.ts` · `backend/src/faturamento/faturamento.service.ts` · `backend/src/orders/dto/create-order.dto.ts` · `backend/src/orders/orders.service.ts` · `backend/src/orders/orders.service.spec.ts` · `frontend/src/pages/PedidoForm.tsx` · `package.json` e `package-lock.json` (raiz) · `.claude/settings.local.json`

Novos, não rastreados: `backend/src/database/migrations/0031_restore_schema_invariants.sql` · `backend/src/database/verify-schema.ts`

**Nota de precisão:** a lista acima é o snapshot no início do primeiro passe de registro. Uma segunda checagem mostrou também `backend/src/products/products.controller.ts`, `backend/src/products/products.service.ts`, `backend/src/products/products.service.spec.ts`, `frontend/src/pages/Produtos.tsx`, `frontend/src/services/products.service.ts` e `frontend/src/services/products.service.test.ts` como modificados — é a frente da seção 8 (PROB-0069/0070), que **fechou depois, ainda nesta sessão**, e está registrada em BUG-0024 e BUG-0025. Segue valendo: **nada commitado, `Commit: pendente` em todas as entradas.**

**Complemento do segundo passe:** o teste de integração temporário que provou `multer@2.2.0` funcionando sob `platform-express@10` (Nest + supertest com `FileInterceptor`) **foi removido e não está no diff** — ver 8.3 e [BACKLOG-0043](../BACKLOG.md). O `package.json` da raiz ganhou, além de `overrides`, um bloco `comments.overrides` com o motivo de cada override e a condição de remoção.

## 10. O que ficou pendente e a quem cabe

| Item | Dono | Quando |
|---|---|---|
| PROB-0064 (mass assignment cross-tenant) | `backend-engineer` | **antes do deploy** |
| PROB-0065 (sync ignora máquina de estados) | `software-architect` → `backend-engineer` | **antes do deploy** |
| PROB-0061 (infra de sync ausente; religar triggers) | decisão do **usuário** → `database-engineer` | antes do deploy |
| BACKLOG-0041 (`db:verify` contra produção) | `database-engineer` | **gate de deploy** |
| PROB-0068 / BACKLOG-0040 (NestJS 10 → 11) | `software-architect` + **usuário** (data) | item com data própria |
| PROB-0066, PROB-0067 | `backend-engineer` (+ `security-auditor` no 0067) | fila normal |
| ~~PROB-0069/0070/0071~~ | — | **FECHADOS nesta sessão** (BUG-0024, BUG-0025, BUG-0026) |
| BACKLOG-0042 (avisar que a importação não aceita mais `.xlsx`) | **usuário** / produto | **junto do deploy** — impacto direto em quem usa |
| BACKLOG-0045 (validar import com arquivo real do Excel pt-BR) | `qa` / **usuário** | antes do go-live (barato) |
| BACKLOG-0043, BACKLOG-0044 (guarda do override de multer; cópia única de typeorm) | `backend-engineer` / infra | fila normal |
| BACKLOG-0024 a BACKLOG-0039, BACKLOG-0046 | conforme cada item | fila normal |
| Commit de tudo o que está no working tree | **usuário** | — |

## 11. Recomendação final

**PASS_COM_RESSALVA.** Os dois bloqueadores da máquina de estados de pedido foram corrigidos e o mecanismo que vinha destruindo invariantes de banco foi desligado, com as invariantes restauradas e um detector de drift criado. Mas **não recomendo deploy antes de**:

1. Rodar `db:verify` contra **produção** ([BACKLOG-0041](../BACKLOG.md)) — hoje não se sabe se produção tem os CHECKs de `version > 0`, os índices únicos que impedem comissão duplicada, os triggers de `updated_at` ou as tabelas de sync. Em dev, os CHECKs estavam **zerados**. Se faltar em produção, a falha aparece como corrupção silenciosa de dado real, não como erro.
2. Corrigir **PROB-0064** — única quebra real de isolamento multi-tenant identificada.
3. Resolver **PROB-0065** — sem ele, as correções de PROB-0062/0063 são parciais: a mesma classe de falha continua alcançável pelo push de sync.
4. Definir data para **PROB-0068 / BACKLOG-0040** (NestJS 11). **Atualizado no segundo passe:** o gate de dependências desta rodada está fechado (20 → 13 advisories, nenhum alcançável), então BACKLOG-0040 deixou de ser urgência de segurança imediata e passou a ser **o único caminho para os 13 restantes** — continua precisando de data, com menos pressão.
5. **Novo no segundo passe:** **comunicar que a importação de produtos não aceita mais `.xlsx`** ([BACKLOG-0042](../BACKLOG.md)). É mudança de contrato visível para o usuário final, e ele vai encontrá-la sozinho, na forma de um 400, se ninguém avisar.

Ressalva de método que atravessa todo o relatório: **a suíte verde não é evidência sobre o banco.** Ela é mock puro no módulo mais crítico desta entrega, e esta sessão mostrou duas vezes que as invariantes em que ela confia podem simplesmente não existir no Postgres.

## 12. Registros gerados

**Primeiro passe (revisão + Wave 0/Wave 1):**

- **PROBLEM_LEDGER:** PROB-0059 e PROB-0060 atualizados (ABERTO → FECHADO_COM_RESSALVA, com correção de escopo/diagnóstico); PROB-0061 a PROB-0071 criados.
- **BUGFIX_LOG:** BUG-0019 a BUG-0023.
- **BACKLOG:** BACKLOG-0024 a BACKLOG-0041.
- **SYSTEM_OVERVIEW:** seções "Fluxo principal do produto" e "Limitações conhecidas" atualizadas.

**Segundo passe (Wave 2 — fechamento das três frentes, seção 8):**

- **PROBLEM_LEDGER:** PROB-0069, PROB-0070 e PROB-0071 atualizados **EM_ANDAMENTO → FECHADO**, com solução aplicada, detalhes técnicos, decisões e riscos residuais; PROB-0068 atualizado com o **resultado do gate de dependências** (20 → 13, nenhum alcançável).
- **BUGFIX_LOG:** BUG-0024 (papaparse/CSV-only), BUG-0025 (`parseImportPrice`), BUG-0026 (overrides + dedup de typeorm), BUG-0027 (guarda de DTO reescrita — problema introduzido pela própria sessão).
- **BACKLOG:** BACKLOG-0042 a BACKLOG-0046.
- **SYSTEM_OVERVIEW:** seção "Módulos principais" (importação agora CSV-only) e nota de dependências.
- **Este relatório:** seções 4, 8, 9, 10, 11 e 12 atualizadas.

**CORREÇÃO DE ESTADO DE COMMIT (verificada por `git log` / `git show --stat` no segundo passe):** ao contrário do que este relatório afirmava (cabeçalho e seção 9), **o trabalho foi commitado**. Commit **`f85809f`** — _"fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes"_, 2026-07-22 15:56, autor Allan Carvalho, **22 arquivos** (código dos três workspaces + `package.json`/`package-lock.json` da raiz + os docs do primeiro passe). As entradas BUG-0019 a BUG-0027 foram atualizadas de `Commit: pendente` para `f85809f`. **O agente de documentação não commitou nada** — apenas registrou o estado real. As afirmações "nada commitado" nas seções anteriores ficam preservadas como snapshot do momento em que foram escritas.
