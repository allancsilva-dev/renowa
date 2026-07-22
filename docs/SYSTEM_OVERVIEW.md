# SYSTEM_OVERVIEW — Renowa

Visão de alto nível do funcionamento do sistema. Mantido pelo `docs-reporter`. Atualizar conforme o sistema evolui. Fatos verificados; suposições marcadas como tal.

_Última atualização: 2026-07-22 (parte 3) — seções "Limitações conhecidas" e "Fluxo principal do produto" corrigidas após a sessão de revisão independente + testes + Wave 0/Wave 1 do commit `d91b9b3`, registrada em [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) (PROB-0059 a PROB-0071) e [REVIEW_REPORTS/2026-07-22_fullstack_review_fluxo-comercial-completo-wave0-wave1.md](REVIEW_REPORTS/2026-07-22_fullstack_review_fluxo-comercial-completo-wave0-wave1.md). Mudanças de fato: `synchronize` **desligado em todo ambiente** (só liga com `DB_SYNC=true` explícito), migration `0031` restaurando as invariantes apagadas, novos scripts `db:migrate`/`db:verify`, e a lição transversal de que **`schema_migrations` não é evidência confiável do conteúdo do banco**. **Nada desta sessão foi commitado — tudo está no working tree.** Seções "Stack real", "Arquitetura geral", "Fluxo de autenticação", "Fluxo multi-tenant", "Ciclo de sync offline", "Integrações" e "Principais decisões técnicas" **não foram reauditadas nesta rodada**._

_Última atualização anterior: 2026-07-22 (parte 2) — seções "Módulos principais", "Fluxo principal do produto" e "Limitações conhecidas" atualizadas após a implementação "Fluxo Comercial Completo" (pedidos → faturamento → comissão → caixa), registrada em [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) e [REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md](REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md). **Nota importante:** essa implementação está inteira no working tree, sem nenhum commit, no momento desta atualização — confirmado por `git status`._

_Última atualização anterior: 2026-07-22 (parte 1) — seções "Fluxo multi-tenant" e "Pontos frágeis atuais" corrigidas contra o código atual: `role_permissions` já foi dropada pela migration `0022`, PROB-0034 já estava FECHADO — texto ainda descrevia como problema não reconciliado; "Endpoints de sync sem RBAC" (PROB-0007) já estava corrigido há tempo — texto seguia desatualizado. Gatilho: overhaul de RBAC de 6 etapas registrado em [PROBLEM_LEDGER.md#PROB-0058](PROBLEM_LEDGER.md). Atualização anterior, 2026-07-21: seção "Limitações conhecidas" ganhou nota sobre as duas fontes de dado de "venda" no Financeiro, achado do smoke test de regressão do Dashboard — ver [PROBLEM_LEDGER.md#PROB-0056](PROBLEM_LEDGER.md). Seção "Fluxo de autenticação" já havia sido corrigida antes nesta mesma data — descrevia o fluxo ZonaDevAuth/JWKS pré-migração; ver [PROBLEM_LEDGER.md#PROB-0052](PROBLEM_LEDGER.md). Demais seções (Stack real linha 9, Arquitetura geral linha 16, Integrações linha 51 ainda citam ZonaDevAuth/JWKS para o fluxo web) **não foram reauditadas nesta rodada** — mesmo risco de drift já sinalizado em PROB-0052, não confirmado/corrigido agora por estar fora do escopo pedido nesta sessão. Seções restantes seguem como estavam desde a auditoria completa de 2026-07-08 — ver [REVIEW_REPORTS/2026-07-08_full_system_audit.md](REVIEW_REPORTS/2026-07-08_full_system_audit.md))._

## Stack real

- **Backend:** NestJS + TypeORM + PostgreSQL. Auth via `jose` (JWKS) e `jsonwebtoken`.
- **Frontend:** React + Vite + TypeScript + Tailwind + shadcn/ui + Zustand + React Hook Form + Zod + Recharts + axios + React Router v6.
- **Mobile:** React Native + Expo + expo-sqlite + expo-secure-store + @react-native-community/netinfo + axios.
- **Monorepo:** `backend/`, `frontend/`, `mobile/`.

## Arquitetura geral

SaaS multi-tenant. Tenant #1 = Renowa Representações. Ecossistema ZonaDev: **ZonaDevAuth** (identidade, repo separado) + **Renowa** (este repo, produto).

## Módulos principais

- **Backend:** `auth` (JWKS + sessão mobile), `sync` (push/pull offline por entidade), domínio de negócio (usuários, clientes, fornecedores, pedidos, produtos), `finance` (movimentações, comissões, parceiros, dashboard), `faturamento` (novo, 2026-07-22 — entity `NotaFiscal`, CRUD de notas fiscais vinculadas a pedido, recálculo de status do pedido e geração 1:1 de comissão), `consultas` (novo, 2026-07-22 — `GET /consultas/cnpj/:cnpj` via BrasilAPI, só autenticação, sem RBAC dedicado — decisão confirmada com o usuário), `common` (interceptor de tenant, subscriber, base entity).
- **Frontend:** rotas protegidas (`App.tsx`), layout (`AppShell.tsx` / `Sidebar.tsx`), auth store (Zustand persist), camada de serviço axios.
- **Mobile:** entry (`App.tsx`), `SyncService`, `ApiService`, fila SQLite de operações offline, schema SQLite local.

## Fluxo de autenticação

- **Auth nativa (desde o commit `d3934e2`, "feat(auth): add native backend authentication").** ZonaDevAuth/JWKS foi totalmente substituído para o fluxo web — confirmado em 2026-07-21 (`grep -rln "ZonaDev\|jose" backend/src/auth backend/src/main.ts` → sem ocorrência).
- **Web:** login por `email`+`senha` (`NativeAuthService.login`, `backend/src/auth/native-auth.service.ts`); senha com hash local (`PasswordService`). Servidor emite par de tokens HS256 próprios — access token (`AccessTokenService`) e refresh token (`RefreshTokenService`, com rotação e detecção de reuse) — em cookies `httpOnly` (`renowa_at` e `renowa_rt`, `backend/src/auth/cookie.util.ts`). `sameSite: 'strict'`; `secure` é condicional a `NODE_ENV === 'production'` (não fixo — Safari em `http://localhost` descarta cookies `Secure` silenciosamente; ver [PROB-0049](PROBLEM_LEDGER.md)). Logout, troca de senha, mudança de papel e anonimização LGPD invalidam tokens via `access_token_version` (ver PROB-0031/PROB-0032/BACKLOG-0009).
- **Mobile:** `POST /api/auth/mobile-session` também recebe `email`+`senha` (`MobileSessionService.createSessionFromCredentials`, mesmo hash de senha do fluxo web) e devolve um JWT HS256 (30 dias, `RENOWA_JWT_SECRET`) — não usa cookie.
- `senha_hash` **existe** em `usuarios` desde a migração para auth nativa (era ausente antes, quando a autenticação dependia só do ZonaDevAuth) — usado tanto pelo login web quanto pela criação de sessão mobile, ambos por `email`+`senha`.

## Fluxo multi-tenant

- `tenant_id UUID NOT NULL` nas tabelas tenant-scoped, inclusive `tenant_role_permissions` após migration 007. `tenant_role_permissions` é hoje o **único** modelo de RBAC — a tabela global legada `role_permissions` foi dropada pela migration `0022_remove_legacy_rbac_and_order_vendor_fk.sql` (comentário no próprio arquivo: "PROB-0034: tenant_role_permissions is the sole RBAC model"; confirmado por `grep -rn "role_permissions\b" backend/src` sem ocorrência fora de `tenant_role_permissions`). `permissions` permanece catálogo global de slugs (fonte tipada em `shared/src/permissions/catalog.ts`, `PERMISSION_CATALOG`/`PERMISSION_SLUGS`, 25 slugs — ver [PROB-0058](PROBLEM_LEDGER.md)).
- `tenant_id` vem **exclusivamente do JWT** — nunca aceito do cliente. Verificado: nenhum controller/service confia em `tenant_id` do cliente; services REST filtram e forçam `tenant_id` de `user.tenantId`.
- Tenant é passado explicitamente para services/repositories. Subscriber e CLS mortos foram removidos; isolamento não depende de interceptação parcial de inserts.

## Fluxo principal do produto

Representação comercial: usuários registram clientes e pedidos. `pedidos` usa `numero_pedido` = sequence global, com `UNIQUE(tenant_id, numero_pedido)`. Mobile opera offline e sincroniza.

### Ciclo comercial completo (pedidos → faturamento → comissão → caixa) — 2026-07-22

Implementado nesta data (plano `/Users/Zero/.claude/plans/fluxo-comercial-completo-buzzing-seal.md`; ver [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) e [REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md](REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md) para o registro completo). **Toda esta seção descreve código que está no working tree, ainda sem commit, no momento deste registro.**

- **Ciclo de vida de status de `pedidos`:** `em_aberto` → `liberado` → `parcialmente_faturado`/`faturado`, ou `cancelado` a qualquer momento (`CHECK (status IN ('em_aberto','liberado','parcialmente_faturado','faturado','cancelado'))`, migration `0027`). "Liberar" um pedido (`PATCH /pedidos/:uuid/liberar`, permissão `pedidos.liberar`) trava permanentemente a edição comercial/itens do pedido — ação irreversível pela API atual.
- **Faturamento:** módulo `faturamento` permite registrar uma ou mais notas fiscais (`notas_fiscais`, migration `0028`) contra um pedido liberado; cada nota recalcula o status do pedido (`parcialmente_faturado` se soma das notas < total do pedido, `faturado` se igual/maior) e gera uma comissão 1:1 vinculada (`comissoes.nota_fiscal_id`, migration `0029`).
- **Comissão:** entidade `Commission` ganhou `pedido_id`/`nota_fiscal_id`/`data_pagamento` e os métodos `informarPercentual`/`registrarPagamento`; ciclo de vida de status próprio (`CHECK (status IN ('pendente','faturado','pago'))`, migration `0029`).
- **Permissões novas:** módulo `FATURAMENTO` no catálogo (`shared/src/permissions/catalog.ts`), slugs `pedidos.liberar`, `faturamento.ver`, `faturamento.editar`; papel `financeiro` ganhou os 4 slugs (`pedidos.ver`/`pedidos.liberar`/`faturamento.ver`/`faturamento.editar`).
- **Consulta de CNPJ:** `GET /consultas/cnpj/:cnpj` (módulo `consultas`, via BrasilAPI) usado pelos formulários de Cliente/Fornecedor para pré-preencher dados a partir do CNPJ.
- **Importação de produtos:** `POST /produtos/importacao` (multipart) para cadastro em lote. **Em mudança no momento desta atualização:** a lib `xlsx@0.18.5` está sendo substituída por `papaparse` e a importação passa a aceitar **só CSV** (`.xlsx` não é requisito — decidido pelo usuário), por causa de 2 advisories HIGH sem correção disponível no registry recebendo upload de usuário. Ver [PROB-0069](PROBLEM_LEDGER.md) (EM_ANDAMENTO).
- **Ciclo de vida de status — regra de autoridade (corrigida em 2026-07-22):** `status` de pedido **não é campo de entrada**. Não é aceito em `POST /pedidos` nem em `PUT /pedidos/:uuid`; só muda por `PATCH /pedidos/:uuid/liberar` (permissão `pedidos.liberar`), por `PATCH /pedidos/:uuid/status` (que só aceita `cancelado`) e pelo `FaturamentoService`. Antes da correção, mandar `{"status":"liberado"}` no corpo contornava por completo a permissão `pedidos.liberar` — ver [PROB-0062](PROBLEM_LEDGER.md)/BUG-0022. **Exceção conhecida e ainda aberta:** o caminho de **push de sync** escreve `status` direto na tabela, sem passar pelo `OrdersService` ([PROB-0065](PROBLEM_LEDGER.md), ABERTO).

## Ciclo de sync offline (mobile)

- Mobile envia `uuid`; servidor resolve para `id` (UUID→ID resolution — CHANGELOG #3).
- Transaction por item no `POST /api/sync` (CHANGELOG #4).
- Pull por entidade: `GET /api/sync/:entidade` (CHANGELOG #8).
- Limite de 200 itens por `POST /api/sync` (CHANGELOG #11).
- `server_time` presente em todo response; mobile usa como âncora **do cursor** — nunca `new Date()` do dispositivo (CHANGELOG #12). **Ressalva (2026-07-08):** o relógio do dispositivo ainda é usado para o `client_timestamp` que alimenta a resolução de conflito LWW no servidor — perda de edição sob clock skew ([PROB-0022](PROBLEM_LEDGER.md)). Além disso o cursor é **único e global entre as 6 entidades** (não por entidade), causando perda silenciosa de dados ([PROB-0008](PROBLEM_LEDGER.md)).

## Integrações

- **ZonaDevAuth** — provedor de identidade federada (JWKS para web, base da sessão mobile).

## Principais decisões técnicas

- Multi-tenant por coluna `tenant_id` (não schema-per-tenant).
- CLS no Interceptor, não no middleware, por causa da ordem de execução relativa ao Guard.
- Validação de JWT via `jose`/JWKS em vez de passport-jwt.
- Soft delete (`deleted_at`) em todas as entidades via `base.entity`.

## Concorrência nas edições web

- Pedidos e registros financeiros editáveis carregam `version` inteiro, iniciado em `1`.
- PATCH e DELETE devem enviar a versão recebida na leitura. Escrita usa condição atômica `uuid + tenant_id + version`; sucesso incrementa versão.
- Versão divergente retorna HTTP `409` com código `CONCURRENT_MODIFICATION`; frontend recarrega dados e informa conflito sem repetir escrita automaticamente.
- Registro inexistente ou pertencente a outro tenant retorna `404`, sem revelar existência cross-tenant.
- Migration obrigatória: `backend/src/database/migrations/0007_optimistic_concurrency.sql`, aplicada antes da nova API.
- Escopo atual: frontend web. Mobile/sync offline permanece sob política LWW e será tratado separadamente em PROB-0022/BACKLOG-0005.

## Limitações conhecidas

- Cursor de sync por **offset** (CHANGELOG #13) — sujeito a pular/repetir item sob escrita concorrente. Migração planejada para cursor por `updated_at` na v2.0. Ver [BACKLOG-0001](BACKLOG.md).
- ~~Dois modelos de permissão coexistem (`role_permissions` string-role vs `tenant_role_permissions` tenant-escopado) — não reconciliado.~~ Reconciliado pela migration `0022_remove_legacy_rbac_and_order_vendor_fk.sql`, que dropa `role_permissions`; `tenant_role_permissions` é o único modelo de RBAC ([PROB-0034](PROBLEM_LEDGER.md), FECHADO). O bypass hardcoded `role.name === 'admin'` que ainda existia sobre esse modelo (fazendo a permissão granular do papel `admin` ser inconsequente) foi removido separadamente no overhaul de RBAC de 2026-07-22 ([PROB-0058](PROBLEM_LEDGER.md)).
- ~~Schema de produção vem só das migrations, mas dev usa `synchronize` → divergência dev↔prod.~~ **Resolvido em 2026-07-22 (parte 3):** `backend/src/app.module.ts` agora usa `synchronize: config.get('DB_SYNC') === 'true'` — só liga com a variável explícita (pensada para o 1º boot de um banco vazio), **nunca por `NODE_ENV`**. Migrations SQL são fonte de verdade em **todo** ambiente. O motivo está comentado no próprio código. Histórico do dano: o mecanismo apagou invariantes **duas vezes**; na reincidência confirmada por query, o schema `public` de dev estava com **zero CHECK constraints** (as migrations declaram ~20), sem os 2 índices únicos parciais e sem os triggers `set_updated_at` — incluindo as constraints `version > 0` que são a base do controle de concorrência otimista. Restaurado pela migration `0031_restore_schema_invariants.sql` (aditiva e idempotente). Ver [PROB-0059](PROBLEM_LEDGER.md) (FECHADO_COM_RESSALVA) e BUG-0019/BUG-0020. **Ressalva: produção não foi verificada** — ver [BACKLOG-0041](BACKLOG.md).
- **Efeito colateral do `synchronize` que sobrevive à correção:** ele **renomeou** as FKs compostas das migrations `0028`/`0029` (`fk_notas_fiscais_tenant_pedido` → `FK_<hash>`). As FKs existem e mantêm o par `(tenant_id, ...)` — isolamento preservado — mas os blocos `DO $$ IF NOT EXISTS (conname = 'fk_...')` daquelas migrations **perderam idempotência contra o banco de dev**: reexecutá-las criaria FK duplicada. **Ninguém deve "só rodar a migration de novo".**
- **`schema_migrations` não é evidência confiável do que existe no banco, em nenhum ambiente.** Confirmado em 2026-07-22: `0008_sync_change_feed.sql` e `0009_sync_push_v2.sql` constam como aplicadas, mas `sync_outbox`/`sync_changes`/`sync_mutation_inbox`, as funções `capture_sync_outbox`/`drain_sync_outbox` e a sequence `sync_change_revision_seq` **não existem** no banco de dev — logo, o push/pull do mobile está quebrado em dev. Não é o mecanismo do `synchronize` (não há `@Entity` para essas tabelas). Auditoria de schema deve inspecionar o catálogo do Postgres, não a tabela de controle. Ver [PROB-0061](PROBLEM_LEDGER.md), ABERTO.
- **Triggers `set_updated_at` (achado 2026-07-22, diagnóstico corrigido):** a função `public.set_updated_at()` **existe** (recriada por `CREATE OR REPLACE` na migration `0028`) — faltavam só os **triggers**, restaurados em dev pela `0031` (17 tabelas com `trg_set_updated_at` + `trg_notas_fiscais_updated_at`). **Produção não verificada.** Ver [PROB-0060](PROBLEM_LEDGER.md), FECHADO_COM_RESSALVA.
- **Ferramenta de verificação de schema (nova, 2026-07-22):** `npm run db:verify` (`backend/src/database/verify-schema.ts`) compara o banco contra as invariantes esperadas **por estrutura, não por nome** (necessário porque o `synchronize` renomeia índice/FK para `IDX_<hash>`/`FK_<hash>`); é read-only, parametrizado por `DATABASE_URL`, sai 0/1/2. `npm run db:migrate` executa o runner fora do boot — antes disso **não existia script de migration algum**, o runner só era chamado no boot em produção (`backend/src/main.ts:13`). Ver BUG-0021.
- **A suíte automatizada não exercita nenhuma invariante de banco.** Toda a suíte de `faturamento`/`finance`/`orders` é mock puro (`jest.fn()` sobre repositórios); nada roda contra Postgres. Os 236 testes verdes não provam que locks pessimistas, FKs compostas, índices únicos parciais e CHECKs funcionem — a asserção "duas notas concorrentes no mesmo pedido serializam" é inverificável hoje. Ver [BACKLOG-0028](BACKLOG.md).
- Duas fontes de dado para "venda" no módulo Financeiro, sem reconciliação automática: a tabela `pedidos` (venda real do fluxo comercial) e a tabela `financeiro_movimentacao` (lançamentos manuais livres, tipos `'Custo Fixo' | 'Custo Rotativo' | 'Venda'`, criados só pela tela Financeiro). Nenhum fluxo do sistema cria automaticamente um lançamento `financeiro_movimentacao` tipo `'Venda'` ao fechar um pedido. O KPI "Faturamento" do Dashboard passou a somar `pedidos` (2026-07-21, ver [PROB-0056](PROBLEM_LEDGER.md)/BUG-0016) para bater com "Evolução de Venda"/"Curva ABC de Clientes", que já usavam `pedidos` — mas essa é uma decisão de negócio ainda **não confirmada formalmente** com o usuário/PO ([BACKLOG-0018](BACKLOG.md)). A tabela `financeiro_movimentacao` continua existindo e sendo editável manualmente pela tela Financeiro, só deixou de alimentar esse KPI específico.

## Pontos frágeis atuais (auditoria 2026-07-08)

**BLOCKER:**
- Segredos de produção reais versionados (`env_renowa.txt`) — [PROB-0002](PROBLEM_LEDGER.md).
- SQL injection de identificador + mass-assignment no push de sync — [PROB-0003](PROBLEM_LEDGER.md) / [PROB-0019](PROBLEM_LEDGER.md).
- Migrations não sobem em banco vazio (sem CREATE TABLE, sintaxe inválida, índice em coluna inexistente) — [PROB-0004..0006](PROBLEM_LEDGER.md).

**HIGH:**
- ~~Endpoints de sync sem RBAC — qualquer usuário escreve tudo.~~ Corrigido — [PROB-0007](PROBLEM_LEDGER.md) (FECHADO): `sync-authorization.service.ts` aplica checagem de permissão por entidade/operação em todo o caminho de sync; único bypass restante é `SUPERADMIN` (conceito de plataforma cross-tenant), confirmado por leitura direta do arquivo em 2026-07-22 ([PROB-0058](PROBLEM_LEDGER.md)).
- Cursor global de sync + avanço em falha + pull sobrescrevendo edições locais → perda de dados — [PROB-0008..0010](PROBLEM_LEDGER.md).
- FKs sem `tenant_id` composto → referência cross-tenant no DB — [PROB-0011](PROBLEM_LEDGER.md).
- Casing de role trava admin real; AuthCallback trata falha como sucesso — [PROB-0014](PROBLEM_LEDGER.md) / [PROB-0015](PROBLEM_LEDGER.md).

**Defesa em profundidade:** filtros explícitos na aplicação e constraints tenant-scoped no banco. SQL cru exige o mesmo contrato explícito.

**LGPD:** sem erasure, sem trilha de auditoria, PII em cleartext no mobile — [PROB-0030..0032](PROBLEM_LEDGER.md).

- _Suposição: cobertura de testes das regras críticas (isolamento tenant, ciclo de sync) ainda não auditada — validar com `test-engineer`._
# Pedido comercial e validação

O módulo de pedidos calcula quantidades, descontos, IPI e totais exclusivamente no backend. Criação e `PUT /pedidos/:uuid` persistem cabeçalho e itens em uma transação com concorrência otimista. A aplicação web oferece criação/edição completa e gera um PDF A4 retrato a partir da versão persistida mais recente. O contrato e as evidências estão em `docs/MetaRenowa.md`.
