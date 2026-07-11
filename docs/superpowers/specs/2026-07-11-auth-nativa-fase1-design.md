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
- Módulos: `backend/src/auth/*` (JwksStrategy, mobile-session, auth.service, auth.controller, auth.module), `backend/src/users/*` (espelho de `usuarios`).

## 3. Decisões travadas

| Decisão | Escolha |
|---|---|
| Escopo | Somente FASE 1 (auth nativa) |
| Modelo de tenant no login | **Email global único** — 1 tenant de fato (Renowa). `tenant_id` continua `NOT NULL`, mas o login resolve o usuário só por email; `tenant_id` é lido da linha encontrada. |
| Primeiro admin | **Insert manual no banco** via script pontual (gera hash argon2id + imprime SQL). Sem seed automático. |
| A) Mobile / JwksStrategy | Migrar `mobile-session` para credenciais nativas (email+senha → HS256 30d) e **remover `JwksStrategy`** nesta rodada. App mobile ajusta depois; backend já fica pronto. |
| B) Secret do access token | **Secret separado** `RENOWA_AT_SECRET` para o access token web (isola do `RENOWA_JWT_SECRET` de 30d do mobile). |

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
| `/api/users` | POST | admin only | criação de usuário com senha inicial (sem cadastro público) |
| `/api/users` | GET | admin only | listagem paginada |
| `/api/users/:id` | PATCH | admin only | ativar/desativar, alterar roles, reset de senha |

### 4.5 Defesas no login

- Resposta genérica (401 idêntico + tempo aproximadamente constante) para "usuário inexistente" e "senha incorreta" — evita enumeração de contas. Executar `argon2.verify` contra um hash dummy quando o usuário não existe, para nivelar o tempo.
- Lockout progressivo: após 5 falhas, `locked_until = now() + backoff` (1min → 5min → 15min...). Zerar `failed_login_attempts` no login bem-sucedido.
- Validar `is_active = true`, `deleted_at IS NULL` e `senha_hash IS NOT NULL`.

### 4.6 Guards e RBAC

- `JwtAuthGuard` global (`APP_GUARD`) lê o JWT do **cookie `renowa_at`** (web). Fallback `Authorization: Bearer` (mobile).
- Decorator `@Public()` para rotas abertas (login, refresh, health).
- `RolesGuard` + `@Roles('admin')` para rotas administrativas.
- **Mantém o shape de `RequestUser`** (`sub`, `email`, `roles`, `tenantId`, ...) para não quebrar o `tenant-context.interceptor` / CLS. O interceptor continua populando o CLS a partir do `RequestUser`.

### 4.7 Frontend (React)

- Remover fluxo PKCE/OIDC: `AuthCallback` (front) e `OidcController` (back). Limpar `AuthContext` antigo.
- Novo `AuthContext`: `login(email, password)`, `logout()`, `user`, `status`.
- Todas as chamadas com `credentials: 'include'`.
- Interceptor axios: em 401, tentar `POST /api/auth/refresh` **uma única vez** e repetir a request; falhou → redireciona ao login. Mutex/promise compartilhada para evitar refresh simultâneo.
- Tela de login: estados loading/erro/sucesso; erro genérico ("credenciais inválidas").
- Tela de administração de usuários (só admin): criar usuário, ativar/desativar, resetar senha.
- `VITE_API_URL` já inclui `/api` — não repetir nos paths.

### 4.8 Limpeza pós-migração

- Remover `JwksStrategy` e dependência de JWKS (`jose`) no fluxo web/mobile.
- Remover variáveis de ambiente `ZONADEV_JWKS_URL`, `ZONADEV_EXPECTED_ISS`, `ZONADEV_EXPECTED_AUD`.
- Remover cookie `zonadev_sid` de qualquer lógica.
- Adicionar `RENOWA_AT_SECRET` ao `.env.example` (backend).

### 4.9 Primeiro admin (insert manual)

Script pontual em Node (ex.: `backend/scripts/create-admin.ts`), executado localmente:
- Recebe email, nome, senha e `tenant_id` (do tenant Renowa).
- Gera `senha_hash` via `argon2.hash`.
- Imprime o `INSERT INTO usuarios(uuid, tenant_id, email, nome, senha_hash, roles, is_active, created_at, updated_at) VALUES (...)` para o operador rodar no banco (ou executa direto, conforme flag).
- Não roda em migração; não lê de env em produção.

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
Remover: `ZONADEV_JWKS_URL`, `ZONADEV_EXPECTED_ISS`, `ZONADEV_EXPECTED_AUD`.

## 10. Critérios de aceite

- Login/logout funcionam sem qualquer dependência do ZonaDevAuth.
- Sessão persiste além de 15 min sem reautenticação (refresh transparente).
- Logout encerra a sessão (refresh revogado — repetir refresh após logout → 401).
- Refresh antigo após rotação → revoga a família inteira.
- `vendedor` recebe 403 em rota admin.
- Isolamento multi-tenant intacto (CLS recebe `tenant_id` do JWT nativo).
- Primeiro admin criado via insert manual autentica com sucesso.
