# Auditoria — Fotos no pedido · Pedido externo · Módulo SAC

- **Data:** 2026-07-29
- **Tipo:** auditoria de código (read-only)
- **Objeto:** a implementação registrada em `2026-07-29_fullstack_implementation_fotos-pedido-externo-sac.md`
- **Escopo:** `backend/`, `frontend/`, `shared/`. `mobile/` **não tocado nem inspecionado** (restrição de `AGENTS.md`).
- **Estado de commit:** tudo no working tree, sem commit.
- **Entrega desta sessão:** **apenas relatório e documentação.** Nenhum arquivo de código foi
  alterado. As correções propostas estão na seção 6, prontas para colar, mas **não aplicadas**.

---

## 0. Método e limites

O que foi executado nesta auditoria:

- inspeção do catálogo do PostgreSQL do container `renowa-dev-postgres` (banco `renowa`, dev,
  schema em `0032`) — **somente leitura**, nenhuma escrita, nenhum banco criado ou destruído;
- comparação de `sha256` dos 19 arquivos de migration aplicados contra `public.schema_migrations`;
- leitura do código novo e do runtime do TypeORM 0.3.31 instalado em `node_modules/`.

O que **não** foi executado, e por quê:

| Não executado | Motivo |
|---|---|
| `npm run lint / build / test` nos 3 workspaces | Nenhum código foi alterado nesta sessão. As execuções da sessão de implementação continuam válidas: backend 405 testes / 48 suítes, frontend 43, shared 9, todos verdes. |
| `db:migrate` / `db:verify` contra banco descartável | Nenhum arquivo de migration foi criado. A `0036` proposta na seção 6.1 **não foi aplicada nem verificada em banco nenhum**. |
| Qualquer request HTTP contra a aplicação | O banco de dev está bloqueado para migrar (PROB-0072) e o schema em dev não tem as tabelas `0033`/`0034`/`0035`. Ver BACKLOG-0049 e BACKLOG-0053. |

Consequência direta: os itens marcados **"verificado por leitura"** na seção 4 são conclusões
sobre o comportamento do código, não observações do comportamento em execução.

---

## 1. Bloqueadores

### B1 — `0007` foi alterado depois de aplicado; dev **e produção** estão travados (PROB-0072)

Causa raiz **confirmada**, e o alcance é maior que o registrado no ledger. O arquivo
`0007_optimistic_concurrency.sql` foi alterado pelo commit **`0f066ae`** ("fix(deploy): destravar
producao em VPS com banco vazio"), que removeu o `BEGIN/COMMIT` interno. O banco de dev tinha
aplicado a versão anterior (`c5fa24a`).

```
$ shasum -a 256 backend/src/database/migrations/0007_optimistic_concurrency.sql
dd64bf244f9811eb734bc1690ca31511f005ed28834c7a47e0c260afe166c201

$ docker exec … psql -U renowa -d renowa -At \
    -c "SELECT checksum FROM public.schema_migrations WHERE name='0007_optimistic_concurrency.sql';"
f5d5654ce8b0c55c54f4c127c1f1123fa1b3f642f4fa5e3586454227a5de4c63

$ git show c5fa24a:backend/src/database/migrations/0007_optimistic_concurrency.sql | shasum -a 256
f5d5654ce8b0c55c54f4c127c1f1123fa1b3f642f4fa5e3586454227a5de4c63   ← bate com o registrado
$ git show 0f066ae:backend/src/database/migrations/0007_optimistic_concurrency.sql | shasum -a 256
dd64bf244f9811eb734bc1690ca31511f005ed28834c7a47e0c260afe166c201   ← bate com o arquivo de hoje
```

É a **única** divergência entre as 19 migrations aplicadas e os arquivos (comparação completa por
`join` das duas listas de checksum).

**Evidência de catálogo — não de `schema_migrations`.** O efeito de `0007` está no banco:

```
$ … -c "SELECT c.relname, a.attnotnull, pg_get_expr(d.adbin,d.adrelid)
        FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='version' …"
comissoes|version|t|1
financeiro_movimentacao|version|t|1
inadimplencia|version|t|1
parceiros_comerciais|version|t|1
pedidos|version|t|1

$ … -c "SELECT rel.relname, con.conname FROM pg_constraint con … WHERE contype='c'
        AND pg_get_constraintdef(con.oid) ILIKE '%version%>%0%';"
… comissoes_version_check, financeiro_movimentacao_version_check, inadimplencia_version_check,
  parceiros_comerciais_version_check, pedidos_version_check … (todos presentes)
```

As cinco colunas existem, com `NOT NULL DEFAULT 1`, e os cinco CHECKs estão em `pg_constraint`.
A migration `0007` está materialmente aplicada; só o registro de controle ficou para trás.
Reconciliar o checksum é seguro — não é o cenário de PROB-0059.

**O ponto novo:** a mudança entre as duas versões é a remoção do controle de transação, sem
alteração de DDL. Ou seja, **qualquer banco provisionado antes de `0f066ae` está igualmente
travado**, inclusive produção. PROB-0072 foi registrado como problema de ambiente local; é gate de
deploy. Severidade elevada para **BLOCKER**.

Correção proposta: seção 6.2.

### B2 — O push de sync altera pedido externo sem passar pela guarda de origem (PROB-0074)

`assertOrigem` (`backend/src/orders/orders.service.ts:257`) tem exatamente **dois** call sites —
`:224` (`updateExternal`) e `:283` (`update`) — ambos no caminho HTTP. O sync escreve em `pedidos`
por SQL cru, sem passar pelo `OrdersService`:

- v2: `backend/src/sync/sync.service.ts:317-333` (`UPDATE … SET … version = version + 1 WHERE uuid = $1 AND tenant_id = $2 AND version = $3`)
- v1: `backend/src/sync/sync.service.ts:328-350`

A allowlist (`backend/src/sync/sync-entity-policy.ts:53-56`) permite gravar
`data, status, total_sem_imposto, total_com_imposto, pgt, prazo, local_entrega, observacao`.
**Nada consulta `origem` antes de gravar.** Quatro consequências concretas:

1. **Totais.** `createExternal`/`updateExternal` mantêm `total_sem_imposto = total_com_imposto = valor`
   (`orders.service.ts:194-195`, `:243-244`). O sync sobrescreve os dois livremente, quebrando a
   invariante que o faturamento lê (`total_com_imposto ?? total_sem_imposto`).
2. **Violação de CHECK vazando crua.** `total_com_imposto: null` num pedido externo viola
   `pedidos_origem_externa_check`. `NOT VALID` isenta linhas legadas, **não escritas novas** — o
   `23514` sobe como falha bruta de item de sync, não como 400 semântico.
3. **Status sem máquina de estados e sem a permissão certa.** O sync exige apenas `pedidos.editar`
   (`sync-entity-policy.ts:52`); `status` está na allowlist. Um device pode gravar `liberado`,
   `faturado` ou `cancelado` direto, sem `pedidos.liberar` e sem `updateStatus`/`liberar`. A única
   barreira é o CHECK de enum, que valida o **valor**, não a **transição**. Isto agrava PROB-0065 e
   agora atinge também pedido externo.
4. **Gate de edição ausente.** `updateExternal` recusa editar fora de `em_aberto`
   (`orders.service.ts:227-229`); o sync não tem esse gate.

Nota: `serverControlledFields` — que lista `origem` e cujo comentário afirma "a allowlist já barra"
(`sync-entity-policy.ts:67-71`) — **não é lido em runtime** por nenhum arquivo de `backend/src/sync/`.
É consumido apenas pelo teste `sync.service.spec.ts:250-262`. A allowlist de fato barra os três
campos de origem (rejeição em `sync.service.ts:365-379`, projeção em `:400-409`), então `origem`
não pode ser **escrita** pelo sync — mas isso não protege os campos que **podem** ser escritos num
pedido que é externo.

Correção proposta: seção 6.4.

### B3 — O ERASURE não alcança as tabelas novas, e a migration documenta uma cobertura que não existe (PROB-0075)

`backend/src/privacy/privacy.service.ts:69-98` é SQL literal, não dirigido por metadata. As tabelas
que ele toca:

| Fluxo | Tabelas escritas |
|---|---|
| ERASURE / CLIENT | `clientes`, `pedidos` (4 colunas), `pii_audit_events`, `lgpd_requests` |
| ERASURE / USER | `usuarios`, `local_users`, `refresh_tokens`, `mobile_sessions`, `pii_audit_events`, `lgpd_requests` |

`pedido_fotos`, `chamados_sac` e `itens_chamado_sac` **não aparecem em nenhum arquivo** de
`backend/src/privacy/`:

```
$ grep -rn "pedido_fotos\|chamados_sac" backend/src/privacy/
(sem saída)
```

Mas `0034_pedido_fotos.sql:5-9` justifica a decisão de storage exatamente com essa cobertura:

```sql
-- (b) a foto entra no mesmo backup e na mesma transação do pedido que ela
--     documenta, então soft delete e purga LGPD já a cobrem sem job externo;
```

**Isso é falso hoje.** O `UPDATE pedidos` de `privacy.service.ts:78` nulifica `pgt`, `prazo`,
`local_entrega` e `observacao` e não desce para `pedido_fotos`. Uma foto de nota fiscal ou etiqueta
de entrega — com nome, CNPJ e endereço do titular no próprio pixel — sobrevive intacta em `bytea`
depois de um ERASURE **concluído com sucesso**, e continua servível pelo endpoint de conteúdo
enquanto o pedido existir.

Mesmo problema no SAC, agravado: `chamados_sac` tem FK direta para `clientes(tenant_id, id)`
(`0035:63-68`), e o ERASURE de cliente não visita a tabela. O cliente vira
`"Titular anonimizado ab12cd34"` enquanto o chamado segue apontando para ele com
`numero_nfe`, `observacao` e `itens_chamado_sac.motivo` em texto livre.

O relatório de implementação (`…_fullstack_implementation_….md:59-61`) repete o comentário da
migration sem verificação independente. A afirmação precisa ser corrigida lá, ou o código precisa
alcançá-la.

Correção proposta: seção 6.5. Ver também BACKLOG-0051, cujo critério de aceite se apoia na mesma
premissa.

---

## 2. Melhoria de prioridade alta

### M1 — `UNIQUE(tenant_id, id)`: auditoria completa, e o risco é **menor** que o registrado (PROB-0073)

Nove tabelas tenant-scoped sem o índice no banco de dev (a décima, `itens_pedido`, já foi resolvida
pela `0034`):

```
comissoes
financeiro_movimentacao
inadimplencia
lgpd_requests
local_users
mobile_sessions
parceiros_comerciais
pii_audit_events
tenant_role_permissions
```

A query do enunciado foi ajustada em dois pontos antes de confiar nela: `i.indpred IS NULL` (um
índice único **parcial** não serve como alvo de FK) e `NOT a.attisdropped`. O resultado foi
**confirmado tabela a tabela** por `pg_indexes` — nenhuma das nove tem um `UNIQUE (tenant_id, id)`
total; o que existe é `PK(id)` mais, em algumas, `UNIQUE(tenant_id, uuid)`.

**O achado que muda a leitura de severidade:** cruzando com as 20 FKs compostas existentes, **nenhuma
das nove é alvo de FK composta hoje**. Todos os alvos atuais — `clientes`, `fornecedores`,
`notas_fiscais`, `pedidos`, `produtos`, `usuarios`, `tenant_roles`, `refresh_tokens`,
`transportadoras` — já têm o índice. Não existe FK cross-tenant aberta no schema. É **risco latente
que trava a próxima FK**, exatamente como travou a `0034`, e não uma brecha de isolamento ativa.

`verify-schema.ts` continua cego para o invariante: valida tabelas, CHECKs, índices únicos
**parciais**, funções e triggers — não este. Correções propostas: seções 6.1 e 6.3 (BACKLOG-0052).

---

## 3. Melhorias

| # | Achado | Referência |
|---|---|---|
| m1 | `getApiErrorMessage` não tem ramo para **409** e só aproveita `backendMessage` em 400/403. "Pedido já liberado" e "limite de 10 fotos" (`order-photos.service.ts:168`, `:175`) chegam ao usuário como *"Recurso em uso — não pode ser removido"*, exibido direto no painel (`OrderPhotosPanel.tsx:77`). | `frontend/src/lib/errors.ts:12` |
| m2 | `getBlob` herda o timeout fixo de 10 s de `send`; o PDF baixa todas as fotos em `Promise.all` (`PedidoDetalhe.tsx:86-89`) e os thumbs idem (`OrderPhotosPanel.tsx:47-50`). Em rede lenta a concorrência pode empurrar as últimas para o abort. O **formato de erro está correto** — `{ response: { status, data } }` é o que `getApiErrorMessage` espera. | `frontend/src/lib/apiClient.ts:60`, `:126` |
| m3 | Soft delete não desce para os filhos. `optimisticSoftDelete` marca **uma** linha; `pedido_fotos` e `itens_chamado_sac` ficam `deleted_at IS NULL`, ocultos apenas por filtro repetido em cada query. Qualquer query nova que esqueça o filtro ressuscita os filhos. A guarda de `notas_fiscais` (`orders.service.ts:449-464`) mostra que o padrão foi reconhecido — e não estendido. | `backend/src/common/persistence/optimistic-concurrency.ts:82`; `sac.service.ts:241` |
| m4 | Não existe registro **executável** de tabelas com PII. O inventário vive em prosa (`docs/LGPD_ARCHITECTURE.md:13-18`) e já está desatualizado — não menciona `notas_fiscais`, `parceiros_comerciais`, `transportadoras`, nem as três tabelas novas. As constantes de `privacy.service.ts:9-12` parecem um registro, mas só alimentam o audit log; o SQL é hardcoded. Toda tabela nova é omissão silenciosa por default. | `docs/LGPD_ARCHITECTURE.md`, `privacy.service.ts:9-12` |
| m5 | Não há job de retenção/expurgo em lugar nenhum (`grep -rniE "Cron\|@Interval\|ScheduleModule"` em `backend/src` sem hit real). `pii_audit_events` cresce sem limite. | — |
| m6 | `backend/src/privacy/privacy.service.ts` **não tem spec**. É o único fluxo destrutivo do sistema. | — |
| m7 | Os testes de cálculo do SAC afirmam ser espelhados e não são — ver seção 4, C.10. | `frontend/src/lib/sacCalculation.test.ts:4-8` |
| m8 | `backend/src/orders/order-ownership.ts` exporta `isVendorOnly`/`vendorOwnershipWhere`, mas `updateExternal` usa `this.isVendorOnly` (método privado do service). Possível duplicação da regra que o helper diz querer evitar. | `orders.service.ts:221` |
| m9 | Não existe `@Get('externos')`. Se alguém a adicionar **depois** de `@Get(':uuid')` (`orders.controller.ts:67`), ela nasce morta — `:uuid` captura `"externos"`. Vale um comentário no controller ou um teste de rota. | `orders.controller.ts:67` |

---

## 4. Verificado — não são bugs

Os pontos que a sessão de implementação marcou como incertos. Todos verificados; **nenhum é bug**.
As ressalvas de método valem integralmente.

### C.1 — `leftJoin('f.item','item') + addSelect('item.uuid')` **popula** `photo.item.uuid`

Este era o principal suspeito. Está correto, e o ramo NULL também. Evidência no runtime do TypeORM
0.3.31 instalado:

- **O join é considerado selecionado.** `JoinAttribute.isSelected`
  (`node_modules/typeorm/query-builder/JoinAttribute.js:37-47`) casa por
  `alias + "." + column.propertyPath`. `addSelect('item.uuid')` bate com a coluna `uuid` de
  `OrderItem` → `transformJoins` não cai no `if (!join.isSelected) continue`
  (`…/transformer/RawSqlResultsToEntityTransformer.js:163-164`).
- **A PK não precisa estar no SELECT.** `transformColumns`
  (`…/RawSqlResultsToEntityTransformer.js:135-148`) só pula valores `undefined` e marca
  `hasData = true` para qualquer valor não-nulo. Com `item.uuid` presente e não-nulo,
  `transformRawResultsGroup` devolve a entidade (`:120-123`). O agrupamento por PK degenera
  (`group()` monta a chave com `item_id`, que não está no raw), mas é inofensivo: numa relação
  `ManyToOne` cada grupo de pai tem uma linha.
- **O ramo NULL cai certo.** Com `item_pedido_id IS NULL`, `item.uuid` vem `null` → `hasData` fica
  `false` → `transformRawResultsGroup` devolve `undefined` → `transformJoins` converte para `null`
  (`:184`). `photo.item?.uuid ?? null` → `null` → `vinculado: false`. Exatamente o esperado.

**Ressalva:** verificado por leitura do runtime, não por execução. A spec existente mocka o builder
inteiro e `getMany` devolve `[]` (`order-photos.service.spec.ts:39-43`), então **nada cobre esta
hidratação**. O único ponto onde `item_uuid` é assertado no teste é o caminho de upload, que usa a
query raw `itemUuidById` (`order-photos.service.ts:200-206`), não o `getMany`. Ver BACKLOG-0053.

### C.2 — `select: false` está correto nos dois sentidos

`conteudo` é `@Column({ …, select: false })` (`order-photo.entity.ts:63`). `list()` não pede a
coluna → o `SELECT` não a traz. `content()` faz `addSelect('f.conteudo')`
(`order-photos.service.ts:226`) → traz. **Ressalva:** verificado por leitura; nenhuma query foi
executada contra um banco com a tabela `pedido_fotos`.

### C.3 — `StreamableFile` + `ResponseInterceptor`

A exceção no interceptor devolve o `StreamableFile` intacto antes do embrulho em `{ data }`
(`response.interceptor.ts:34`), e há teste unitário novo (`response.interceptor.spec.ts:30-33`).
Os headers são setados imperativamente via `response.setHeader` e não por `@Header(...)`
(`order-photos.controller.ts:60-63`) — necessário, já que `Content-Type` é dinâmico, e correto com
`@Res({ passthrough: true })`, que preserva a resposta para o Nest concluir.
**Ressalva: o caminho HTTP real nunca rodou.** A integridade dos bytes e a chegada dos headers
`nosniff` / `inline` / `Cache-Control` continuam não observadas. Ver BACKLOG-0053.

### C.4 — `@Body('item_uuid')` no handler do `FileInterceptor`

Uso suportado: o `FileInterceptor` popula `req.body` com os campos de texto do multipart antes do
handler, e `@Body('chave')` lê de lá (`order-photos.controller.ts:24-35`). Não há
`ValidationPipe`/`ParseUUIDPipe` nesse parâmetro — a validação real acontece em `resolveItemId`
(`order-photos.service.ts:130-137`), que lança `BadRequestException` se o item não pertence ao
pedido. **Ressalva: não exercitado por HTTP.**

### C.5 — Não há colisão de rotas

Ordem real em `orders.controller.ts`: `@Post()` `:27` → `@Post('externos')` `:39` →
`@Put('externos/:uuid')` `:45` → `@Get()` `:55` → `@Get(':uuid')` `:67` → `@Put(':uuid')` `:73` →
`@Patch(':uuid/status')` `:83` → `@Patch(':uuid/liberar')` `:93` → `@Delete(':uuid')` `:103`.

`POST /pedidos/externos` (2 segmentos) não compete com `POST /pedidos` (1), e não existe
`@Post(':uuid')`. `PUT externos/:uuid` (2) não compete com `PUT :uuid` (1) — e ainda assim o literal
vem antes, o que é a ordem defensiva correta. **Risco futuro real:** ver m9.

### C.6 — `pedidos_origem_externa_check` não explode num futuro `VALIDATE CONSTRAINT`

`ALTER TABLE … ADD COLUMN IF NOT EXISTS origem varchar NOT NULL DEFAULT 'interno'` preenche **todas**
as linhas legadas com `'interno'`, e `numero_pedido_externo`/`sistema_origem` nascem `NULL`. Isso
satisfaz o ramo `interno` do predicado por construção — não há linha legada capaz de violá-lo.
O ramo `interno` não exige nada de `total_com_imposto`, então pedidos internos sem total também
passam.

**Ressalva:** verificado por leitura da migration, não por execução. O banco de dev tem 6 pedidos
mas está em `0032` — a `0033` não foi aplicada nele (bloqueio B1), então o `VALIDATE` não foi
ensaiado contra dados reais.

### C.7 — A allowlist de sync **barra** os três campos de origem

Confirmado, e por duas camadas: rejeição explícita com `BadRequestException`
(`sync.service.ts:365-379`) e projeção defensiva (`:400-409`). `origem` nunca é escrita pelo sync;
num CREATE via sync o `DEFAULT 'interno'` assume e o CHECK é satisfeito.

Isto responde a metade da pergunta. A outra metade **é o bloqueador B2**: barrar a escrita de
`origem` não protege os campos que o sync **pode** escrever num pedido que já é externo.

### C.8 — LGPD: é achado novo. Ver **B3**.

### C.9 — `apiClient.getBlob`: o formato de erro está certo; o timeout é discutível. Ver **m2**.

### C.10 — A aritmética do SAC é **idêntica** nos dois lados

Os quatro pontos que importam batem entre `backend/src/sac/sac-calculation.ts` e
`frontend/src/lib/sacCalculation.ts`:

| | Backend | Frontend |
|---|---|---|
| rounding | `ROUND_HALF_UP` explícito em cada `toDecimalPlaces` (`:23`, `:25`) | idem (`:17`, `:18`) |
| casas | qty 3 / money 2 | qty 3 / money 2 |
| ordem | unitário arredondado **antes** de multiplicar (`:34`) | idem (`:26`) |
| total | soma dos `valor_total` **já arredondados** (`:44`) | idem (`:33`) |

`Decimal.set({ precision: 40, rounding: ROUND_HALF_UP })` no topo dos dois, consistente com
`order-calculation.ts` e `frontend/src/lib/orderCalculation.ts`. **Não há divergência de valor.**

Duas ressalvas que não mudam número mas invalidam a garantia escrita:

1. **String vazia diverge.** O frontend coalesce `''` para 0 (`sacCalculation.ts:16`); o backend só
   coalesce nullish (`sac-calculation.ts:22-25`), e `new Decimal('')` **lança**. Hoje não há caminho
   de runtime — o DTO exige `@IsNumber({ maxDecimalPlaces: 3 })` (`create-sac-ticket.dto.ts:25,27`)
   — mas um chamador interno futuro (import de CSV, migração) crasha no servidor e não no preview.
2. **Os testes não são espelhados, apesar do comentário afirmar que são**
   (`sacCalculation.test.ts:4-8`). Faltam no frontend: `1.005 → 1.01` e string vinda do banco
   (`'2.500'`). Falta no backend: string vazia. Como os runners são diferentes (Jest / Vitest), nada
   força a sincronia — a garantia é uma afirmação que ninguém verifica.

Nota de assimetria: `calculateSacTotal` recebe itens **já calculados** e `previewSacTotal` recebe
inputs crus. Numericamente equivalente, mas obriga o call site do backend ao `item.valor_total!`
(`sac.service.ts:76-80`) — o `!` transforma em erro de runtime o que poderia ser erro de compilação.

---

## 5. Registro de conformidade

Não afirmo conformidade de lint/build/test nesta entrega: **não os executei**, porque não alterei
código. Os números da sessão de implementação (backend 405/48, frontend 43, shared 9, verdes;
`db:verify` 27/27 tabelas, 33/33 CHECKs, 6/6 índices parciais, 21/21 triggers em banco descartável)
seguem válidos para o código como está e não foram reproduzidos aqui.

---

## 6. Correções propostas (**não aplicadas**)

### 6.1 `0036_unique_tenant_id.sql`

Aditiva e idempotente. Segue o padrão e a justificativa já escritos em
`0034_pedido_fotos.sql:111-117`.

```sql
-- Alvo exigido por toda FK composta de tenant `(tenant_id, x) -> (tenant_id, id)`.
-- Estas tabelas são anteriores ao padrão de 0021_cross_tenant_foreign_keys.sql e
-- nunca receberam o índice: a FK simplesmente não pode ser criada contra elas
-- ("there is no unique constraint matching given keys", SQLSTATE 42830), e o
-- atalho de referenciar só `id` abriria referência cross-tenant.
--
-- Do ponto de vista de unicidade o índice é redundante (`id` já é PK); ele existe
-- para ser alvo de FK. Ver PROB-0073 / BACKLOG-0052.

CREATE UNIQUE INDEX IF NOT EXISTS uq_comissoes_tenant_id_id
  ON public.comissoes (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financeiro_movimentacao_tenant_id_id
  ON public.financeiro_movimentacao (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inadimplencia_tenant_id_id
  ON public.inadimplencia (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lgpd_requests_tenant_id_id
  ON public.lgpd_requests (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_local_users_tenant_id_id
  ON public.local_users (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mobile_sessions_tenant_id_id
  ON public.mobile_sessions (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parceiros_comerciais_tenant_id_id
  ON public.parceiros_comerciais (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pii_audit_events_tenant_id_id
  ON public.pii_audit_events (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_role_permissions_tenant_id_id
  ON public.tenant_role_permissions (tenant_id, id);
```

Sem `BEGIN/COMMIT` — o runner já envolve o arquivo numa transação
(`migrations-hygiene.spec.ts:30-41` reprova o contrário).

**Custo a considerar antes de aplicar:** `pii_audit_events` e `mobile_sessions` são tabelas de
escrita alta; um índice único a mais em cada uma pesa em `INSERT`. O escopo "todas as nove" foi
decidido pelo usuário em favor da uniformidade do invariante.

### 6.2 Patch do `migrate.ts` — destravar `0007` de forma versionada

```ts
/**
 * Migrations cujo ARQUIVO mudou depois de já terem sido aplicadas, e cujo
 * checksum antigo continua sendo aceito porque o efeito no schema é idêntico.
 *
 * `0007`: o commit 0f066ae removeu o BEGIN/COMMIT interno do arquivo (o COMMIT
 * encerrava a transação EXTERNA do runner antes do INSERT em schema_migrations,
 * BACKLOG-0035). Só controle de transação mudou — nenhum DDL. Bancos que
 * aplicaram a versão anterior têm exatamente o mesmo schema, o que foi
 * confirmado no catálogo: coluna `version` NOT NULL DEFAULT 1 e
 * `<tabela>_version_check` presentes nas 5 tabelas. Sem esta entrada, TODO
 * banco provisionado antes de 0f066ae — dev e produção — fica travado para
 * migrar. Ver PROB-0072.
 */
const CHECKSUMS_SUPERSEDIDOS: Record<string, readonly string[]> = {
  '0007_optimistic_concurrency.sql': [
    'f5d5654ce8b0c55c54f4c127c1f1123fa1b3f642f4fa5e3586454227a5de4c63',
  ],
};
```

E no ponto do `throw` (`migrate.ts:38-43`):

```ts
      if (applied.rowCount) {
        const registrado = applied.rows[0].checksum;
        const aceito = registrado === checksum
          || (CHECKSUMS_SUPERSEDIDOS[file] ?? []).includes(registrado);
        if (!aceito) {
          throw new Error(`Migration já aplicada foi alterada: ${file}`);
        }
        continue;
      }
```

Alternativa deliberadamente **não** escolhida: `UPDATE schema_migrations` manual. Resolveria o dev e
deixaria produção travada, sem rastro em código.

Vale um caso em `migrations-hygiene.spec.ts` afirmando que todo checksum listado em
`CHECKSUMS_SUPERSEDIDOS` corresponde a uma versão real do arquivo no git — senão a lista vira porta
para aceitar qualquer coisa.

### 6.3 Invariante no `verify-schema.ts`

Nova seção (as atuais são `[1/4]`…`[4/4]`), no mesmo formato de
`problemas.push({ categoria, detalhe })`:

```ts
    // ── UNIQUE(tenant_id, id) ────────────────────────────────────────────────
    // Alvo exigido por toda FK composta de tenant. Índice único PARCIAL não
    // serve (por isso `indpred IS NULL`) — ver PROB-0073.
    const semAlvoFk = await client.query<{ tabela: string }>(`
      SELECT c.relname AS tabela
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
        AND a.attname = 'tenant_id' AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND EXISTS (SELECT 1 FROM pg_attribute x
                    WHERE x.attrelid = c.oid AND x.attname = 'id' AND NOT x.attisdropped)
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.oid AND i.indisunique
            AND i.indpred IS NULL AND i.indnatts = 2
            AND i.indkey::int2[] @> ARRAY[
              a.attnum,
              (SELECT attnum FROM pg_attribute WHERE attrelid = c.oid AND attname = 'id')
            ]::int2[]
        )
      ORDER BY 1
    `);
```

Cada linha do resultado vira
`problemas.push({ categoria: 'unique(tenant_id,id) ausente', detalhe: tabela })`.
**Ordem de aplicação importa:** ligar esta checagem antes da `0036` faz o `db:verify` reprovar em
todo ambiente.

### 6.4 Gate de origem no sync (esboço)

Duas abordagens; a segunda é a mais alinhada ao desenho atual:

1. **Ler `origem` antes do UPDATE** em `processItem`/`processItemV2` e rejeitar com
   `BadRequestException` quando `origem = 'externo'` e o payload toca `status`,
   `total_sem_imposto` ou `total_com_imposto`. Direto, mas espalha regra de pedido dentro do sync.
2. **Levar a decisão para a policy.** Dar à `SyncEntityPolicy` um gancho (ex.:
   `writableFieldsFor(row)`) para que `pedidos` derive a allowlist da linha corrente. Mantém a regra
   num só lugar e cria o mecanismo que PROB-0065 vai precisar de qualquer forma.

Em ambos, o gate de `status` continua sendo assunto de PROB-0065 — o sync não deveria escrever
`status` direto para **nenhuma** origem.

### 6.5 Extensão do ERASURE (esboço)

Em `privacy.service.ts`, no ramo `subject_type === 'CLIENT'`, junto ao `UPDATE pedidos` de `:78`:

```sql
-- Fotos: zera o binário e marca a linha. `conteudo = NULL` exige relaxar
-- `pedido_fotos_storage_check` OU um `storage_backend = 'purgado'` no CHECK —
-- decidir antes de implementar; o CHECK atual exige conteudo NOT NULL para 'db'.
UPDATE pedido_fotos f SET …, deleted_at = COALESCE(deleted_at, clock_timestamp()),
  version = version + 1
FROM pedidos p
WHERE f.pedido_id = p.id AND f.tenant_id = $1 AND p.tenant_id = $1 AND p.cliente_id = $2;

-- SAC: texto livre e vínculo com NF-e.
UPDATE itens_chamado_sac i SET motivo = NULL
FROM chamados_sac ch
WHERE i.chamado_id = ch.id AND i.tenant_id = $1 AND ch.tenant_id = $1 AND ch.cliente_id = $2;

UPDATE chamados_sac SET observacao = NULL, numero_nfe = NULL, version = version + 1
WHERE tenant_id = $1 AND cliente_id = $2;
```

**Atenção — não é copiar e colar.** `pedido_fotos_storage_check` (`0034:71-82`) exige
`conteudo IS NOT NULL` quando `storage_backend = 'db'`; zerar o binário viola o CHECK. É preciso
decidir entre um terceiro valor de `storage_backend` ou relaxar o predicado, e isso é uma migration.

O caminho estruturalmente melhor é o de m4: um registro executável de tabelas com PII que dirija o
SQL, em vez de mais literais hardcoded que a próxima tabela vai voltar a esquecer.

---

## 7. Itens abertos gerados por esta auditoria

- **PROB-0074** — push de sync altera pedido externo sem `assertOrigem` (B2)
- **PROB-0075** — ERASURE não alcança `pedido_fotos` / SAC (B3)
- **PROB-0072** — atualizado: causa raiz confirmada, severidade BLOCKER, produção incluída
- **PROB-0073** — atualizado: nove tabelas listadas, risco reclassificado como latente
- **BACKLOG-0052** — `0036` + invariante no `verify-schema.ts`
- **BACKLOG-0053** — testes de integração HTTP dos caminhos nunca exercitados
- **BACKLOG-0054** — registro executável de PII + spec de `privacy.service.ts` + retenção
- **BACKLOG-0055** — soft delete em cascata para `pedido_fotos` e `itens_chamado_sac`
- **BACKLOG-0056** — frontend: ramo 409, `backendMessage`, timeout do `getBlob`
- **BACKLOG-0057** — paridade real dos testes de cálculo do SAC
