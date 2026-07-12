# Auditoria completa do sistema — 2026-07-08

## Objetivo

Analisar o sistema inteiro (backend, frontend, mobile, banco, segurança/LGPD) em modo **read-only** e registrar o estado real na documentação viva em `docs/`, no padrão do `docs-reporter`. Nenhum código de aplicação, config, migration ou secret foi alterado.

## Escopo verificado

- **Backend** (NestJS + TypeORM + PostgreSQL): bootstrap, guards globais, interceptor, auth (JWKS RS256 web / JWT HS256 mobile), multi-tenant, sync, finance.
- **Frontend** (React + Vite + TS): rotas protegidas, AppShell/Sidebar, camada de dados (fetch, não axios), auth (cookie OIDC), roles/permissões.
- **Mobile** (React Native + Expo): entry, ciclo de sync offline, fila SQLite, ApiService/SecureStore, sessão.
- **Banco**: 18 entidades TypeORM + 4 migrations `.sql`; invariantes multi-tenant, soft delete, constraints, índices.
- **Segurança + LGPD**: segredos, validação JWT/JWKS, isolamento tenant como fronteira, CORS/cookies, injection, PII, direitos do titular.

## Método

5 subagentes especialistas read-only em paralelo (`backend`, `frontend`, `mobile/sync`, `banco`, `segurança/LGPD`). Divergência entre agentes resolvida por verificação direta:

- Agente de segurança assumiu que `TenantSubscriber` protege INSERTs. **Refutado** por `grep -rn "TenantSubscriber" backend/src` → só o próprio arquivo (linhas 24, 39). Subscriber nunca registrado = código morto (PROB-0016).
- `git ls-files | grep env_renowa` → `env_renowa.txt` **rastreado**; `.gitignore` cobre só `.env*` (PROB-0002 confirmado).

## Arquivos lidos (principais)

- Backend: `main.ts`, `app.module.ts`, `auth/{jwks.strategy,mobile-session.service,auth.service,auth.controller}.ts`, `oidc/oidc.controller.ts`, `common/{interceptors/tenant-context.interceptor,subscribers/tenant.subscriber,filters/global-exception.filter,guards/*}.ts`, `sync/{sync.service,sync.controller,dto/sync.dto}.ts`, `finance/finance.service.ts`, `database/migrations/*.sql`, `**/*.entity.ts`.
- Frontend: `App.tsx`, `main.tsx`, `context/AuthContext.tsx`, `hooks/useAuth.ts`, `components/{ProtectedRoute,layout/AppShell,layout/Sidebar}.tsx`, `pages/{AuthCallback,UsuariosPage}.tsx`, `lib/{apiClient,auth}.ts`, `store/authStore.ts`, `types/index.ts`.
- Mobile: `App.tsx`, `services/{SyncService,ApiService}.ts`, `storage/{sync-queue,database}.ts`, `screens/HomeScreen.tsx`.

## Comandos executados

- `grep -rn "TenantSubscriber" backend/src` → 2 hits (só `tenant.subscriber.ts`).
- `git ls-files | grep -i env_renowa` → `env_renowa.txt`.
- `grep -n env .gitignore` → só padrões `.env*`.

## Achados (resumo por severidade)

Detalhe completo, com `arquivo:linha`, causa, impacto e solução proposta, em [PROBLEM_LEDGER.md](../PROBLEM_LEDGER.md) (PROB-0002 a PROB-0036).

### BLOCKER
| ID | Área | Achado |
|----|------|--------|
| PROB-0002 | segurança | Segredos de produção reais versionados (`env_renowa.txt`) — DB, RENOWA_JWT_SECRET, AUTH_INTERNAL_SECRET. |
| PROB-0003 | backend/segurança | SQL injection de identificador no push de sync (chaves do payload viram nomes de coluna). |
| PROB-0004 | banco | Migration 001 não cria nenhuma tabela de negócio. |
| PROB-0005 | banco | `ADD CONSTRAINT IF NOT EXISTS` — sintaxe inválida no PostgreSQL. |
| PROB-0006 | banco | Índice `idx_comissoes_pedido` em coluna inexistente `comissoes.pedido_id`. |

### HIGH
| ID | Área | Achado |
|----|------|--------|
| PROB-0007 | backend/segurança | Endpoints de sync sem RBAC — qualquer usuário cria/atualiza/deleta tudo. |
| PROB-0008 | mobile | Cursor de sync único e global entre entidades → perda silenciosa de dados. |
| PROB-0009 | mobile | Entidade que falha no pull ainda avança o cursor compartilhado. |
| PROB-0010 | mobile | Pull sobrescreve edições locais não sincronizadas quando push falha. |
| PROB-0011 | banco/segurança | FKs sem `tenant_id` composto → referência cross-tenant no nível do DB. |
| PROB-0012 | banco/segurança | `tenant_role_permissions` sem `tenant_id` (invariante violado). |
| PROB-0013 | banco | `mobile_sessions` e `parceiros_comerciais` ausentes de todas as migrations. |
| PROB-0014 | frontend | Casing de role (`ADMIN` vs `admin`) trava admin real fora de `/configuracoes`. |
| PROB-0015 | frontend | AuthCallback trata falha OIDC como sucesso → loop de redirect. |

### MEDIUM
PROB-0016 (subscriber morto), 0017 (vazamento de erro 500), 0018 (janela lost-update no server_time), 0019 (mass-assignment no sync), 0020 (poison-items/`retry_count` morto), 0021 (syncs sobrepostos por stale-closure), 0022 (LWW por relógio do device), 0023 (apply sem transação), 0024 (`atob`/Hermes — suposição), 0025 (rota mobile-session duplicada), 0026 (fornecedor_id sem validação de tenant), 0027 (permissões frontend stubbed), 0028 (apiClient sem fallback `/api`), 0029 (redirect em render), 0030 (PII em cleartext no mobile — LGPD), 0031 (sem erasure — LGPD), 0032 (sem trilha de auditoria — LGPD).

### LOW
PROB-0033 (drift de índices `comissoes`), 0034 (dois modelos de permissão), 0035 (código morto de auth no frontend), 0036 (itens de robustez agrupados: catch-all/spinner, `algorithms` não pinado, catch RS256 mudo, open-redirect OIDC, CORS fallback dev, plan não revalidado, backoff, mapeamento por índice, precisão decimal, `vendedor_id` sem FK, `timezone` mysql-only).

## Positivos verificados

- `tenant_id` **nunca** vem do cliente; services REST filtram e forçam de `user.tenantId`.
- `AutoProvisionGuard` bloqueia mismatch JWT × local_user.
- JWKS (`jose`) valida `iss`/`aud`; `exp` automático. Sessão mobile checa DB + `token_version` (revogação) + expiry.
- Valores em queries raw são **parametrizados** ($1/$2) — a única exceção é o identificador dinâmico do sync (PROB-0003).
- Sem token/secret em `localStorage`; auth por cookie HttpOnly; sem `dangerouslySetInnerHTML`/`eval`.
- Baseline de hardening: ValidationPipe `whitelist`+`forbidNonWhitelisted`, rate limit por usuário, cookies `HttpOnly+Secure+SameSite`, OIDC PKCE S256+state.

## O que foi corrigido

Nada no código (auditoria read-only por instrução do usuário). Documentação atualizada:

- `docs/PROBLEM_LEDGER.md` — PROB-0002 a PROB-0036.
- `docs/BACKLOG.md` — BACKLOG-0002 a BACKLOG-0008.
- `docs/SYSTEM_OVERVIEW.md` — correção de 2 afirmações falsas (subscriber ativo; `tenant_id` em todas as tabelas), ressalvas de sync, novos pontos frágeis.
- `docs/DIAGRAMS.md` — item 3 corrigido (subscriber não injeta tenant_id).
- Este relatório.

## O que ficou pendente (delegado)

Toda correção de código exige agente dono (não tocado nesta auditoria):

- `backend-engineer`: PROB-0003, 0007, 0017, 0018, 0019, 0022, 0025, 0026, parte de 0036; registrar/remover subscriber (PROB-0016).
- `database-engineer`: PROB-0004, 0005, 0006, 0011, 0012, 0013, 0033, 0034.
- `frontend-engineer`: PROB-0014, 0015, 0027, 0028, 0029, 0035.
- `mobile-engineer`: PROB-0008, 0009, 0010, 0020, 0021, 0023, 0024, 0030.
- `security-auditor`: PROB-0002 (rotação de segredos), 0011, 0012.
- `lgpd-auditor`: PROB-0030, 0031, 0032.

## Recomendação final

Endereçar os **5 BLOCKER antes de qualquer deploy de produção** — em especial rotação de segredos (PROB-0002) e correção das migrations (PROB-0004..0006), sem os quais produção nem sobe. Em seguida os HIGH de isolamento e sync (PROB-0007..0015). O subscriber morto (PROB-0016) deve ser registrado ou removido para eliminar a falsa sensação de defesa em profundidade.

## Status final

**FAIL** — sistema não está pronto para produção: 5 BLOCKER abertos (segredo exposto, injeção de SQL, migrations inválidas). Auditoria concluída e rastreada; nenhuma alteração de código realizada.
