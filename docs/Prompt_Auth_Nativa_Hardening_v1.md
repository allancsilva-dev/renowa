# Prompt — Migração para Autenticação Nativa + Hardening Crítico
**Sistema Renowa | v1 | Para execução via Claude Code**

---

## Contexto

Sistema Renowa (gestão comercial interna) — monorepo com `backend/` (NestJS + TypeScript + PostgreSQL/TypeORM), `frontend/` (React + Vite + TS). Deploy em VPS Hostinger via Docker Compose + Nginx Proxy Manager.

- Domínio do projeto: `nexostech.com.br`
- Frontend: `https://renowa.nexostech.com.br` (container `WEB`, porta 3080)
- Backend: `https://api.renowa.nexostech.com.br` (container `Renowa-API`, porta 3002)
- Banco: PostgreSQL, database `dbrenowa` (container `dbrenowa`)
- Auth atual: OAuth 2.0 PKCE contra ZonaDev Auth (serviço externo) — **será removida**

**Objetivo:** substituir completamente a autenticação via ZonaDev Auth por autenticação nativa do próprio sistema, com o mais alto nível de segurança viável, e aplicar hardening crítico no backend.

**Convenções de código:** nomenclatura em inglês, código limpo e auto-documentado, comentários apenas onde a decisão for não-óbvia. Entregar `doc.md` ao final resumindo o que foi feito, como usar e decisões tomadas.

---

## FASE 0 — Hardening crítico (pré-requisito, aplicar antes da auth)

### 0.1 Desligar `synchronize: true` e adotar migrations
- Em `TypeOrmModule.forRoot`, definir `synchronize: false` em produção.
- Configurar CLI de migrations do TypeORM (`data-source.ts`).
- Gerar migration inicial a partir do schema atual (baseline): `typeorm migration:generate` — validar que a migration gerada é vazia ou apenas ajustes, pois o schema já existe.
- Documentar no `doc.md` o fluxo: alterar entity → `migration:generate` → revisar SQL → `migration:run` no deploy.

### 0.2 ValidationPipe global
Em `main.ts`:
```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // remove campos não declarados no DTO
  forbidNonWhitelisted: true,   // rejeita payload com campos extras
  transform: true,
}));
```
Criar/revisar DTOs com `class-validator` para todos os endpoints existentes que ainda não têm.

### 0.3 Exception filter global
Criar `AllExceptionsFilter` que padroniza toda resposta de erro:
```json
{ "code": "STRING_CODE", "message": "mensagem segura", "timestamp": "ISO", "requestId": "uuid" }
```
- Erros 5xx: logar stack trace completo internamente, responder mensagem genérica (nunca vazar detalhes).
- Registrar via `app.useGlobalFilters()`.

### 0.4 Segurança de borda
- `helmet` no `main.ts`.
- CORS restrito: origem exata do frontend, `credentials: true`.
- Limite de body: `app.use(json({ limit: '1mb' }))`.

### 0.5 Rate limiting
- `@nestjs/throttler` global: 100 req/min por IP.
- Override no login (ver Fase 1): 5 req/min.

### 0.6 Health check
- `GET /health`: retorna `{ status: 'ok', db: true/false }` testando `SELECT 1` no banco.
- Adicionar `healthcheck` no `docker-compose.prod.yml` do backend apontando para essa rota.

### 0.7 Logging estruturado
- Instalar `nestjs-pino`, substituir logger padrão.
- Incluir `requestId` (gerar em middleware, propagar no contexto e nas respostas de erro).

### 0.8 Backup do PostgreSQL (na VPS, fora do código)
Gerar script + instrução de cron:
```bash
# /opt/scripts/backup_renowa.sh — pg_dump diário com retenção
docker exec dbrenowa pg_dump -U <user> dbrenowa | gzip > /opt/backups/renowa_$(date +%F).sql.gz
find /opt/backups -name 'renowa_*.sql.gz' -mtime +30 -delete
```
Cron diário 03:00. Documentar recomendação de copiar os dumps para fora da VPS (rclone/S3) como passo manual futuro.

---

## FASE 1 — Autenticação nativa

### 1.1 Modelo de dados
Verificar schema real antes de qualquer query (`SELECT column_name FROM information_schema.columns WHERE table_name = '...'`).

**Tabela `usuarios`** (já existe conforme arquitetura — validar/ajustar via migration):
- `id`, `uuid UNIQUE`, `email UNIQUE NOT NULL`, `nome`, `senha_hash TEXT`, `role` (`admin` | `vendedor`), `is_active BOOLEAN DEFAULT true`, `failed_login_attempts INT DEFAULT 0`, `locked_until TIMESTAMP NULL`, `created_at`, `updated_at`, `deleted_at`.

**Nova tabela `refresh_tokens`:**
- `id`, `token_hash TEXT NOT NULL` (SHA-256 do token opaco — nunca armazenar em claro),
- `user_id FK`, `family_id UUID NOT NULL` (identifica a "sessão"; todos os tokens rotacionados de um mesmo login compartilham a família),
- `expires_at TIMESTAMP NOT NULL`, `revoked_at TIMESTAMP NULL`, `replaced_by_id FK NULL`,
- `user_agent TEXT`, `ip INET`, `created_at`.
- Índices: `token_hash`, `user_id`, `family_id`.

### 1.2 Hash de senha — Argon2id
- Pacote `argon2` (usar defaults do argon2id da lib, que são seguros).
- Nunca logar senha; comparação sempre via `argon2.verify`.

### 1.3 Fluxo de tokens
**Access token:** JWT assinado com `JWT_SECRET` (env), TTL 15 min, payload mínimo: `sub` (user id), `role`, `jti`. Entregue em cookie:
```
Set-Cookie: renowa_at=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=900
```

**Refresh token:** string aleatória de 64 bytes (`crypto.randomBytes`), opaca. Armazenar apenas o hash. TTL 7 dias. Cookie:
```
Set-Cookie: renowa_rt=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800
```
(`Path=/api/auth` limita o envio do refresh token apenas às rotas de auth.)

**Rotação com detecção de reuso (obrigatório):**
1. `POST /api/auth/refresh`: valida o token recebido contra `token_hash`.
2. Token válido e não revogado → gera novo par (access + refresh), marca o antigo com `revoked_at` e `replaced_by_id`, mantém o mesmo `family_id`.
3. **Token já revogado apresentado novamente = indício de roubo → revogar TODA a família** (`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = ...`) e responder 401.

### 1.4 Endpoints (`AuthModule`)
| Rota | Método | Proteção | Descrição |
|---|---|---|---|
| `/api/auth/login` | POST | Throttle 5/min | email + senha → seta cookies |
| `/api/auth/refresh` | POST | pública (cookie) | rotação de tokens |
| `/api/auth/logout` | POST | autenticada | revoga família do refresh + limpa cookies (Set-Cookie com Max-Age=0) |
| `/api/auth/me` | GET | autenticada | dados do usuário logado |
| `/api/auth/change-password` | POST | autenticada | senha atual + nova; ao trocar, revogar todas as famílias do usuário |
| `/api/users` | POST | **admin only** | criação de usuário (sem cadastro público) |
| `/api/users` | GET | admin only | listagem paginada |
| `/api/users/:id` | PATCH | admin only | ativar/desativar, alterar role, reset de senha |

### 1.5 Defesas no login
- Resposta idêntica (401 genérico, mesmo tempo de resposta aproximado) para "usuário inexistente" e "senha incorreta" — evita enumeração de contas.
- Lockout progressivo: após 5 falhas, `locked_until = now() + interval` com backoff (1min, 5min, 15min...). Zerar `failed_login_attempts` no login bem-sucedido.
- Validar `is_active` e `deleted_at IS NULL`.

### 1.6 Guards e RBAC
- `JwtAuthGuard` global (via `APP_GUARD`) lendo o JWT **do cookie** (não do header Authorization, no web).
- Decorator `@Public()` para rotas abertas (login, refresh, health).
- `RolesGuard` + decorator `@Roles('admin')` para rotas administrativas.
- Preparar o guard para aceitar **também** `Authorization: Bearer` como fallback — será usado pelo mobile (expo-secure-store) na Fase 6 do projeto, sem refatoração.

### 1.7 Frontend (React)
- Remover todo o fluxo PKCE/OIDC (`OidcController` no back também sai; limpar `AuthContext`).
- `AuthContext` novo: `login(email, password)`, `logout()`, `user`, `status`.
- Todas as chamadas `fetch` com `credentials: 'include'`.
- Interceptor: em resposta 401, tentar `POST /api/auth/refresh` **uma única vez** e repetir a request original; se falhar, redirecionar ao login. Usar um mutex/promise compartilhada para evitar múltiplos refresh simultâneos quando várias requests falharem juntas.
- `AbortController` nos efeitos de fetch (padrão já aplicado no projeto — manter).
- Tela de login: estados loading/erro/sucesso explícitos; mensagem de erro genérica ("credenciais inválidas").
- Tela de administração de usuários (visível só para admin): criar usuário, ativar/desativar, resetar senha.
- Lembrar: `VITE_API_URL` já inclui `/api` — não repetir nos paths.

### 1.8 Topologia de cookies — decisão
**Opção A (recomendada):** configurar no Nginx Proxy Manager um location `/api` em `renowa.nexostech.com.br` proxying para `Renowa-API:3002`. Frontend passa a chamar `/api` relativo (mesma origem). Cookies ficam `SameSite=Strict`, sem atributo `Domain`. CORS deixa de existir. Gerar instruções de configuração do NPM no `doc.md`.

**Opção B (fallback, se A não for aplicada agora):** manter `api.renowa.nexostech.com.br`, cookies com `Domain=.renowa.nexostech.com.br` (NUNCA `.nexostech.com.br` — escoparia o cookie para todos os projetos do domínio) e `SameSite=Lax`; adicionar verificação de header customizado (`X-Requested-With`) nas rotas mutantes como mitigação CSRF.

Implementar A por padrão; deixar B documentada.

### 1.9 Limpeza pós-migração
- Remover dependências e variáveis de ambiente do ZonaDev Auth do backend e do frontend.
- Remover cookie `zonadev_sid` de qualquer lógica.
- Seed: criar usuário admin inicial via script/migration (`ADMIN_EMAIL` + `ADMIN_INITIAL_PASSWORD` de env, forçando troca de senha no primeiro login se possível; no mínimo documentar troca imediata).

---

## FASE 2 — Correções de integridade (aplicar na sequência, mesmo PR ou seguinte)

1. **`numero_pedido` via SEQUENCE** do PostgreSQL (migration criando `CREATE SEQUENCE pedidos_numero_seq`), nunca `MAX+1` em código.
2. **Valores monetários**: confirmar `NUMERIC(12,2)` em todas as colunas de valor; recalcular `total_item` e totais do pedido **no servidor** ao persistir (cliente calcula só para exibição).
3. **Transação** ao criar/editar pedido + itens (`dataSource.transaction`).
4. **Paginação** em todas as listagens (`page`/`limit`, default 20, máximo 100).
5. **Sync**: upsert por `uuid` (idempotência); no conflito LWW, comparar `updated_at` recebido mas **gravar `now()` do servidor**; registrar descartes em tabela `sync_conflicts (entidade, uuid, payload_descartado JSONB, motivo, created_at)`.
6. **`deleted_at`** na tabela `comissoes` (consistência com a regra geral).

---

## Critérios de aceite
- Login/logout funcionais em produção sem qualquer dependência do ZonaDev Auth.
- Sessão persiste além de 15 min sem reautenticação (refresh transparente).
- Logout efetivamente encerra a sessão (refresh revogado — repetir refresh após logout retorna 401).
- Apresentar refresh token antigo após rotação revoga a família inteira.
- Usuário `vendedor` recebe 403 em rotas admin.
- `synchronize: false` em produção; deploy roda migrations.
- Todas as respostas de erro seguem o formato padronizado.
- Backup diário configurado e testado (restaurar um dump em banco de teste).

## Deploy
Padrão do projeto, por serviço:
```bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --force-recreate
```
Validar rotas registradas: `docker logs Renowa-API 2>&1 | grep "auth"`.
