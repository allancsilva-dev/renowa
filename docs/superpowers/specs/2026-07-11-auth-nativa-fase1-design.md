# Design — Autenticação Nativa (FASE 1)

- **Data:** 2026-07-11
- **Sistema:** Renowa (monorepo multi-tenant — backend NestJS + TypeORM + PostgreSQL, frontend React + Vite)
- **Origem:** `docs/Prompt_Auth_Nativa_Hardening_v1.md` (FASE 1) + review `docs/REVIEW_REPORTS/2026-07-08_security_review_auth-migration-prompt.md`
- **Escopo desta rodada:** apenas FASE 1 (auth nativa). FASE 0 (hardening) e FASE 2 (integridade) ficam para rodadas separadas.

---

## 1. Objetivo

Substituir a autenticação federada via ZonaDevAuth por autenticação nativa (email + senha) do próprio Renowa, com refresh tokens rotativos e detecção de reuso. Sistema interno: **não há cadastro público** — usuários só são criados por admin, dentro do sistema. O **primeiro admin é inserido manualmente no banco**.

## 2. Contexto atual (estado real do código)

- Auth hoje = federação ZonaDevAuth: `JwksStrategy` valida JWT RS256 via JWKS (web); `mobile-session` troca token ZonaDev por HS256 de 30 dias (mobile).
- Tabela `usuarios`: `email`, `nome`, `roles jsonb` (`string[]`), `is_active`, `last_login_at`, + `id`, `uuid`, `tenant_id`, timestamps de base. **Não tem** `senha_hash`, `failed_login_attempts` nem `locked_until`.
- Índice `(tenant_id, email)` **não-único**. Único existente: `UNIQUE(tenant_id, uuid)`.
- **Não existe** tabela `refresh_tokens`.
- Módulos: `backend/src/auth/*` (JwksStrategy, mobile-session, auth.service, auth.controller, auth.module), `backend/src/users/*`.

### 2.1 Modelo de identidade real (descoberto na análise)

O sistema tem **dois stores de usuário disjuntos** e um RBAC completo pendurado na identidade externa:

- `usuarios` (entity `User`) — usado por **sync/mobile** (FK resolution). Populado por `upsertFromJwt`.
- `LocalUser` (`local_users`, módulo `rbac`) — `authUserId` (= `sub` do ZonaDev), `tenantId`, `roleId`, `email`, `active`. `UNIQUE(authUserId, tenantId)`. É o que **RBAC/permissões** realmente usam.
- `TenantRole` → `TenantRolePermission` → `Permission` (slug) = autorização.
- `AutoProvisionGuard` (global) — a cada request cria/acha `LocalUser` por `authUserId = jwt.sub`, injeta `req.localUser`.
- `PermissionGuard` (global) — lê `@RequirePermission(slug)`. Bypass se role `admin` (`localUser.role.name === 'admin'`) ou `SUPERADMIN` em `jwt.roles`. Senão exige o slug via `TenantRolePermission`.
- `AuthApiService.resolveAuthUserIdByEmail` — `createTenantUser` **exige** usuário pré-existente no ZonaDev.
- `OidcModule` (`/auth/oidc/*`) — fluxo OAuth PKCE ZonaDev; grava cookie `renowa_access_token` (nome via `AUTH_COOKIE_NAME`), domínio `.zonadev.tech`.
- Frontend: `AuthContext` (fetch `/auth/me`), `ProtectedRoute` + `apiClient` (`lib/apiClient`, `lib/auth`) redirecionam p/ `/auth/oidc/start` em 401. `adminOnly = roles.includes('ADMIN')`.

Consequência: auth nativa **substitui a fonte de identidade** (`sub`) e reconecta essa cadeia — não é só `usuarios + senha_hash + refresh_tokens`.

## 3. Decisões travadas

| Decisão | Escolha |
|---|---|
| Escopo | Somente FASE 1 (auth nativa) |
| Modelo de tenant no login | **Email global único** — 1 tenant de fato (Renowa). `tenant_id` continua `NOT NULL`, mas o login resolve o usuário só por email; `tenant_id` é lido da linha encontrada. |
| Primeiro admin | **Insert manual no banco** via script pontual (gera hash argon2id + imprime SQL). Sem seed automático. |
| A) Mobile / JwksStrategy | Migrar `mobile-session` para credenciais nativas (email+senha → HS256 30d) e **remover `JwksStrategy`** nesta rodada. App mobile ajusta depois; backend já fica pronto. |
| B) Secret do access token | **Secret separado** `RENOWA_AT_SECRET` para o access token web (isola do `RENOWA_JWT_SECRET` de 30d do mobile). |
| C) Mapeamento de identidade | **`usuarios.uuid` vira o `sub`**. `usuarios` guarda `senha_hash` e é a identidade. `LocalUser.authUserId = usuarios.uuid` (fonte agora local). RBAC/`PermissionGuard`/`AutoProvisionGuard` **mantidos** — só troca a origem do `sub`. |
| D) Autorização admin | **Reusar RBAC**: rotas admin usam `@RequirePermission('users.manage')`; role `admin` já faz bypass no `PermissionGuard`. Sem `RolesGuard` novo. |
| E) Criação de usuário | **Admin cria identidade local completa**: `POST /users` cria a linha `usuarios` (com `senha_hash` inicial) **e** o `LocalUser` (roleId) numa transação. `AuthApiService`/`resolveAuthUserIdByEmail` **removidos**. |

## 4. Arquitetura

### 4.1 Schema (migração TypeORM)

`synchronize` já deve ficar `false` para esta migração rodar de forma controlada (parte do hardening da FASE 0; aqui garantimos ao menos que a migração é aplicada explicitamente, sem depender de `synchronize`).

**ALTER `usuarios`:**
- `+ senha_hash TEXT NULL` — nullable para linhas legadas; obrigatório para login nativo (usuário sem `senha_hash` não autentica).
- `+ failed_login_attempts INT NOT NULL DEFAULT 0`
- `+ locked_until TIMESTAMPTZ NULL`
- Remover índice não-único `(tenant_id, email)`; criar **`UNIQUE(email)`** global.

**Nova tabela `refresh_tokens`** (segue a regra multi-tenant: `tenant_id UUID NOT NULL`):

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | PK | base |
| `uuid` | UUID UNIQUE | base |
| `tenant_id` | UUID NOT NULL | herdado da regra multi-tenant |
| `token_hash` | TEXT NOT NULL | SHA-256 do token opaco — nunca em claro |
| `user_id` | FK `usuarios.id` NOT NULL | |
| `family_id` | UUID NOT NULL | identifica a sessão; tokens rotacionados do mesmo login compartilham a família |
| `expires_at` | TIMESTAMPTZ NOT NULL | |
| `revoked_at` | TIMESTAMPTZ NULL | |
| `replaced_by_id` | FK `refresh_tokens.id` NULL | |
| `user_agent` | TEXT NULL | |
| `ip` | INET NULL | |
| `created_at`/`updated_at`/`deleted_at` | base | |

Índices: `token_hash`, `user_id`, `family_id`, `tenant_id`.

### 4.2 Hash de senha

- Pacote `argon2` (argon2id, defaults da lib). Comparação sempre via `argon2.verify`. Senha nunca logada nem retornada.

### 4.3 Fluxo de tokens

**Access token:** JWT HS256 assinado com `RENOWA_AT_SECRET`, TTL 15 min. Payload mínimo: `sub` (user id), `email`, `roles` (`string[]`), `tenantId`, `jti`. Entregue em cookie:
```
Set-Cookie: renowa_at=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
```

**Refresh token:** string aleatória de 64 bytes (`crypto.randomBytes`), opaca. Persistir apenas `token_hash` (SHA-256). TTL 7 dias. Cookie:
```
Set-Cookie: renowa_rt=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800
```

**Rotação com detecção de reuso:**
1. `POST /api/auth/refresh` valida o token recebido contra `token_hash`.
2. Válido e não revogado → gera novo par (access + refresh), marca o antigo com `revoked_at` + `replaced_by_id`, mantém o mesmo `family_id`.
3. Token **já revogado** apresentado de novo = indício de roubo → revoga **toda a família** (`revoked_at = now()` para o `family_id`) e responde 401.

### 4.4 Endpoints (`AuthModule`)

| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/auth/login` | POST | Throttle 5/min | email + senha → seta cookies `renowa_at` + `renowa_rt` |
| `/api/auth/refresh` | POST | pública (cookie) | rotação de tokens |
| `/api/auth/logout` | POST | autenticada | revoga a família do refresh + limpa cookies (`Max-Age=0`) |
| `/api/auth/me` | GET | autenticada | dados do usuário logado (adapta o handler já existente) |
| `/api/auth/change-password` | POST | autenticada | senha atual + nova; ao trocar, revoga todas as famílias do usuário |
| `/api/auth/mobile-session` | POST | Throttle 10/min | email + senha → HS256 30d (`RENOWA_JWT_SECRET`); substitui a troca ZonaDev |
| `/api/users` | POST | `@RequirePermission('users.manage')` | cria `usuarios` (com `senha_hash`) + `LocalUser` (role) em transação. Sem cadastro público |
| `/api/users` | GET | `@RequirePermission('users.manage')` | listagem paginada |
| `/api/users/:id` | PATCH | `@RequirePermission('users.manage')` | ativar/desativar, alterar role, reset de senha |

`createTenantUser` (reescrito): remove `AuthApiService.resolveAuthUserIdByEmail`. Passa a — em `dataSource.transaction` — (1) inserir `usuarios` (`uuid` gerado, `email`, `nome`, `senha_hash` do argon2, `roles`, `tenant_id`); (2) `ensureTenantRole` + inserir `LocalUser` (`authUserId = usuarios.uuid`, `roleId`, `email`, `tenantId`). Rejeita email já existente (`UNIQUE(email)`).

### 4.5 Defesas no login

- Resposta genérica (401 idêntico + tempo aproximadamente constante) para "usuário inexistente" e "senha incorreta" — evita enumeração de contas. Executar `argon2.verify` contra um hash dummy quando o usuário não existe, para nivelar o tempo.
- Lockout progressivo: após 5 falhas, `locked_until = now() + backoff` (1min → 5min → 15min...). Zerar `failed_login_attempts` no login bem-sucedido.
- Validar `is_active = true`, `deleted_at IS NULL` e `senha_hash IS NOT NULL`.

### 4.6 Guards e RBAC (reusa o existente)

- `JwtAuthGuard` global (`APP_GUARD`): trocar a validação RS256 (`jwksStrategy.verify`) por **verificação do access token nativo HS256** (`RENOWA_AT_SECRET`) lido do cookie `renowa_at`. Mantém o fallback mobile HS256 (`mobileSessionService.validateSessionToken`) para `Authorization: Bearer`. Cookie name migra de `renowa_access_token` → `renowa_at`.
- `@Public()` para rotas abertas (login, refresh, health).
- **Autorização admin via `@RequirePermission('users.manage')`** no `PermissionGuard` já existente (role `admin` faz bypass). Sem guard de role novo.
- `AutoProvisionGuard` **mantido**: agora `jwt.sub = usuarios.uuid` (identidade local). Ele provisiona `LocalUser` por `authUserId = sub` como rede de segurança; o caminho normal (`POST /users`) já cria o `LocalUser`.
- **Mantém o shape de `RequestUser`** (`sub`, `email`, `roles`, `tenantId`, ...) → `tenant-context.interceptor`/CLS intactos. Access token nativo popula `sub` (= `usuarios.uuid`), `tenantId`, `roles` (de `usuarios.roles`), `email`.

### 4.6.1 Mapeamento de identidade (decisão C)

- Login resolve `usuarios` por `email` (UNIQUE global) → obtém `uuid`, `tenant_id`, `roles`.
- Access token: `sub = usuarios.uuid`, `tenantId = usuarios.tenant_id`, `roles = usuarios.roles`, `email`.
- `LocalUser.authUserId` passa a ser preenchido com `usuarios.uuid` (não mais o id do ZonaDev). Nenhuma migração de dados legados é necessária nesta fase (base sem usuários nativos ainda; o 1º admin é criado do zero).

### 4.7 Frontend (React)

- Remover fluxo PKCE/OIDC: página `AuthCallback` + rota `/callback`; redirecionamentos p/ `/auth/oidc/start` em `ProtectedRoute` (`components/ProtectedRoute.tsx`) e em `lib/apiClient.ts`; `logout` via `/auth/oidc/logout` em `AuthContext` e `authStore`.
- `AuthContext`: adicionar `login(email, password)` (POST `/auth/login`, `credentials:'include'`); `logout()` passa a chamar `POST /auth/logout` e redirecionar p/ `/login`. `loadUser` continua batendo `/auth/me`.
- Nova página de **login** (`/login`, pública): form email+senha (React Hook Form + Zod), estados loading/erro/sucesso, erro genérico ("credenciais inválidas").
- `ProtectedRoute`: sem `user` → `<Navigate to="/login" replace />` (não redirect externo).
- `lib/apiClient.ts`: em 401, tentar `POST /auth/refresh` **uma única vez** (mutex/promise compartilhada em `lib/auth`) e repetir a request; falhou → `window.location.href = '/login'`.
- Tela de administração de usuários já existe (`pages/configuracoes/UsuariosPage`): ajustar p/ criar usuário **com senha inicial** e reset de senha (novos campos do DTO).
- `VITE_API_URL` já inclui `/api` — não repetir nos paths. Remover `VITE_AUTH_URL`.

### 4.8 Limpeza pós-migração

- Remover `JwksStrategy` e dependência de JWKS (`jose`) no fluxo web/mobile.
- Remover `OidcModule` (`oidc.controller`/`oidc.service`/`oidc.module`) e o registro em `app.module`.
- Remover `auth-api` (`AuthApiService`/`auth-api.module`) e a dependência em `UsersModule`.
- Remover variáveis de ambiente ZonaDev: `ZONADEV_JWKS_URL`, `ZONADEV_EXPECTED_ISS`, `ZONADEV_EXPECTED_AUD`, `AUTH_URL`, `AUTH_INTERNAL_SECRET`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`, `OIDC_LOGOUT_REDIRECT`.
- Remover cookie `zonadev_sid` e o domínio `.zonadev.tech` de qualquer lógica de cookie.
- Adicionar `RENOWA_AT_SECRET` ao `.env.example` (backend).

### 4.9 Primeiro admin (insert manual)

Script pontual em Node (`backend/scripts/create-admin.ts`), executado localmente:
- Recebe email, nome, senha e `tenant_id` (do tenant Renowa) por argv/env local.
- Gera `senha_hash` via `argon2.hash`.
- Numa transação, insere: (1) `usuarios` (`uuid` gerado, `tenant_id`, `email`, `nome`, `senha_hash`, `roles = ['admin']`, `is_active = true`); (2) `TenantRole` `admin` (se não existir) e o `LocalUser` (`authUserId = usuarios.uuid`, `roleId`, `email`, `tenantId`, `active`).
- Alternativa: com flag `--print`, só imprime o SQL para o operador rodar no banco.
- Não roda em migração; não lê segredo de env em produção.

## 5. Fluxo de dados (login → request autenticada)

```
POST /api/auth/login {email, senha}
  → AuthService.login: busca usuário por email (UNIQUE global)
  → valida is_active + deleted_at + lockout + argon2.verify
  → gera access JWT (RENOWA_AT_SECRET, 15min) + refresh opaco (64B, hash no DB, family nova)
  → Set-Cookie renowa_at + renowa_rt
Request autenticada
  → JwtAuthGuard lê cookie renowa_at → valida JWT → popula req.user (RequestUser com tenantId)
  → tenant-context.interceptor lê req.user → popula CLS (tenant_id)
  → controller executa no escopo do tenant
Access expira (15min)
  → request retorna 401 → interceptor front chama POST /api/auth/refresh (cookie renowa_rt)
  → AuthService.refresh: valida hash, rotaciona (revoga antigo, novo par, mesma family)
  → repete request original
```

## 6. Tratamento de erros

- Login/refresh inválidos → 401 genérico (`{ code, message, timestamp, requestId }` — formato padrão da FASE 0; se o exception filter ainda não existir, usar 401 simples e alinhar depois).
- Reuso de refresh revogado → 401 + revogação da família.
- Rotas admin com role insuficiente → 403.
- Nunca vazar se o email existe, se a senha está errada, ou detalhes de lockout além de mensagem genérica.

## 7. Testes (mínimo desta fase)

- Login sucesso seta ambos os cookies; login inválido → 401 genérico.
- Lockout após 5 falhas; reset ao logar.
- Refresh rotaciona e revoga o token anterior.
- Reapresentar refresh revogado → 401 + família inteira revogada.
- `logout` revoga a família; refresh após logout → 401.
- `change-password` revoga todas as famílias do usuário.
- Isolamento multi-tenant preservado: `RequestUser.tenantId` chega ao CLS (não regredir).
- Role `vendedor` → 403 em rota admin.

## 8. Fora de escopo (rodadas seguintes)

- FASE 0: `synchronize:false` completo, ValidationPipe global, exception filter, helmet/CORS/body-limit, throttler global, health check, logging estruturado, backup.
- FASE 2: sequence `numero_pedido`, valores monetários, transações, paginação global, upsert de sync, `deleted_at` em `comissoes`.
- Alteração do app mobile (Expo) para o novo fluxo de credenciais — backend já fica pronto via `mobile-session` nativo.

## 9. Variáveis de ambiente

Adicionar: `RENOWA_AT_SECRET`.
Manter: `RENOWA_JWT_SECRET` (mobile 30d), `DATABASE_URL`.
Remover: todas as ZonaDev/OIDC listadas em 4.8 (`ZONADEV_*`, `AUTH_URL`, `AUTH_INTERNAL_SECRET`, `OIDC_*`) + frontend `VITE_AUTH_URL`.

## 10. Critérios de aceite

- Login/logout funcionam sem qualquer dependência do ZonaDevAuth.
- Sessão persiste além de 15 min sem reautenticação (refresh transparente).
- Logout encerra a sessão (refresh revogado — repetir refresh após logout → 401).
- Refresh antigo após rotação → revoga a família inteira.
- `vendedor` recebe 403 em rota admin.
- Isolamento multi-tenant intacto (CLS recebe `tenant_id` do JWT nativo).
- Primeiro admin criado via insert manual autentica com sucesso.
