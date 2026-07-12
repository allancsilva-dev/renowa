# SYSTEM_OVERVIEW — Renowa

Visão de alto nível do funcionamento do sistema. Mantido pelo `docs-reporter`. Atualizar conforme o sistema evolui. Fatos verificados; suposições marcadas como tal.

_Última atualização: 2026-07-08 (após auditoria completa do sistema — ver [REVIEW_REPORTS/2026-07-08_full_system_audit.md](REVIEW_REPORTS/2026-07-08_full_system_audit.md))._

## Stack real

- **Backend:** NestJS + TypeORM + PostgreSQL. Auth via `jose` (JWKS), `nestjs-cls`, `jsonwebtoken`.
- **Frontend:** React + Vite + TypeScript + Tailwind + shadcn/ui + Zustand + React Hook Form + Zod + Recharts + axios + React Router v6.
- **Mobile:** React Native + Expo + expo-sqlite + expo-secure-store + @react-native-community/netinfo + axios.
- **Monorepo:** `backend/`, `frontend/`, `mobile/`.

## Arquitetura geral

SaaS multi-tenant. Tenant #1 = Renowa Representações. Ecossistema ZonaDev: **ZonaDevAuth** (identidade, repo separado) + **Renowa** (este repo, produto).

## Módulos principais

- **Backend:** `auth` (JWKS + sessão mobile), `sync` (push/pull offline por entidade), domínio de negócio (usuários, clientes, pedidos), `common` (interceptor de tenant, subscriber, base entity).
- **Frontend:** rotas protegidas (`App.tsx`), layout (`AppShell.tsx` / `Sidebar.tsx`), auth store (Zustand persist), camada de serviço axios.
- **Mobile:** entry (`App.tsx`), `SyncService`, `ApiService`, fila SQLite de operações offline, schema SQLite local.

## Fluxo de autenticação

- **Web:** cookie HTTP-only emitido pelo ZonaDevAuth. Token RS256 validado via JWKS com `jose` (não passport-jwt).
- **Mobile:** JWT HS256 (30 dias, `RENOWA_JWT_SECRET`) gerado em `POST /api/auth/mobile-session`.
- `senha_hash` **não existe** na tabela `usuarios` — autenticação é exclusiva do ZonaDevAuth.

## Fluxo multi-tenant

- `tenant_id UUID NOT NULL` na maioria das tabelas. **Exceção verificada (2026-07-08):** tabelas RBAC `permissions`, `role_permissions` (catálogos, plausivelmente globais) e `tenant_role_permissions` (dado de tenant que **deveria** ter `tenant_id`) não têm a coluna — ver [PROB-0012](PROBLEM_LEDGER.md).
- `tenant_id` vem **exclusivamente do JWT** — nunca aceito do cliente. Verificado: nenhum controller/service confia em `tenant_id` do cliente; services REST filtram e forçam `tenant_id` de `user.tenantId`.
- CLS populado em **Interceptor** (não middleware — middleware roda antes do Guard). Fluxo: **Middleware → Guard → Interceptor → Controller**.
- **Correção (2026-07-08):** o `tenant.subscriber` **NÃO está ativo** — a classe nunca é registrada como provider nem instanciada por DI (`grep -rn TenantSubscriber backend/src` → só o próprio arquivo). A proteção "injeta tenant_id em todo INSERT" **não existe**; interceptor+CLS são efetivamente código morto. Isolamento depende 100% de cada service passar `tenantId` manualmente (hoje passam). Sync usa `INSERT` cru e nunca passaria por subscriber. Ver [PROB-0016](PROBLEM_LEDGER.md).

## Fluxo principal do produto

Representação comercial: usuários registram clientes e pedidos. `pedidos` usa `numero_pedido` = sequence global, com `UNIQUE(tenant_id, numero_pedido)`. Mobile opera offline e sincroniza.

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
- Dois modelos de permissão coexistem (`role_permissions` string-role vs `tenant_role_permissions` tenant-escopado) — não reconciliado ([PROB-0034](PROBLEM_LEDGER.md)).
- Schema de produção vem só das migrations, mas dev usa `synchronize` → **divergência dev↔prod** ([PROB-0004](PROBLEM_LEDGER.md)).

## Pontos frágeis atuais (auditoria 2026-07-08)

**BLOCKER:**
- Segredos de produção reais versionados (`env_renowa.txt`) — [PROB-0002](PROBLEM_LEDGER.md).
- SQL injection de identificador + mass-assignment no push de sync — [PROB-0003](PROBLEM_LEDGER.md) / [PROB-0019](PROBLEM_LEDGER.md).
- Migrations não sobem em banco vazio (sem CREATE TABLE, sintaxe inválida, índice em coluna inexistente) — [PROB-0004..0006](PROBLEM_LEDGER.md).

**HIGH:**
- Endpoints de sync sem RBAC — qualquer usuário escreve tudo — [PROB-0007](PROBLEM_LEDGER.md).
- Cursor global de sync + avanço em falha + pull sobrescrevendo edições locais → perda de dados — [PROB-0008..0010](PROBLEM_LEDGER.md).
- FKs sem `tenant_id` composto → referência cross-tenant no DB — [PROB-0011](PROBLEM_LEDGER.md).
- Casing de role trava admin real; AuthCallback trata falha como sucesso — [PROB-0014](PROBLEM_LEDGER.md) / [PROB-0015](PROBLEM_LEDGER.md).

**Defesa em profundidade:** o `tenant.subscriber` documentado **não está ativo** (código morto) — isolamento depende só da disciplina de aplicação ([PROB-0016](PROBLEM_LEDGER.md)).

**LGPD:** sem erasure, sem trilha de auditoria, PII em cleartext no mobile — [PROB-0030..0032](PROBLEM_LEDGER.md).

- _Suposição: cobertura de testes das regras críticas (isolamento tenant, ciclo de sync) ainda não auditada — validar com `test-engineer`._
