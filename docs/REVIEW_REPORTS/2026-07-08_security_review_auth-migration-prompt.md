# Review — Prompt de Migração Auth Nativa + Hardening vs. Código Real

- **Data:** 2026-07-08
- **Área:** security / backend / banco
- **Tipo:** review
- **Origem:** análise do usuário (`docs/PossiveisErros.md`) cruzada com o código atual pelo `docs-reporter`.
- **Status final:** PASS_COM_RESSALVA

## Objetivo

O usuário produziu `docs/PossiveisErros.md` — 23 apontamentos sobre o prompt `Prompt_Auth_Nativa_Hardening_v1.md` (migração planejada de OAuth/ZonaDev para **auth nativa**). O arquivo não segue o padrão da doc viva. Este relatório:
1. Confirma quais apontamentos **batem com o código atual** (defeito real hoje).
2. Separa os que descrevem comportamento **pós-migração** (código ainda não existe — não dá pra "bater").
3. Aponta os já cobertos por entradas existentes do ledger.
4. Registra os confirmados no `PROBLEM_LEDGER` e o hardening da migração no `BACKLOG`.

## Escopo verificado

- Prompt de migração e o arquivo do usuário.
- `main.ts`, `app.module.ts`, `common/entities/base.entity.ts`.
- `database/migrations/001_initial_schema.sql`.
- `finance/finance.service.ts`, `clients/dto/create-client.dto.ts`.
- Grep global: `VersionColumn`/optimistic locking; validadores CNPJ/CEP.

## Comandos executados

- `grep -c VersionColumn|@Version|optimistic backend/src` → **0 ocorrências**.
- Leitura de `create-client.dto.ts` → `cnpj`/`cep` só `@IsString()`.
- Leitura de `main.ts` → sem `app.set('trust proxy')`.
- Leitura de `base.entity.ts` + migration 001 → `@UpdateDateColumn` **e** trigger `set_updated_at` coexistem.

## Achados — verdict por apontamento

Legenda: **CONFIRMADO** (defeito no código hoje) · **FUTURO** (comportamento pós-migração, código inexistente) · **JÁ-REGISTRADO** (coberto por PROB existente) · **REFUTADO** (não bate com o código) · **DECISÃO** (escolha de arquitetura, não defeito).

| # | Apontamento (PossiveisErros) | Sev. usuário | Verdict | Evidência / destino |
|---|---|---|---|---|
| 1 | TIMESTAMP sem timezone quebra LWW | 🔴 | **CONFIRMADO** | `base.entity.ts:31-38` usa `@Create/Update/DeleteDateColumn` → `timestamp without time zone` no Postgres; trigger grava `now()` (timestamptz truncado). → **PROB-0037** |
| 2 | Falta `trust proxy` atrás do NPM | 🔴 | **CONFIRMADO** | `main.ts` sem `app.set('trust proxy')`. Impacto parcial hoje (throttle por `user.sub`), pleno após auth nativa (cookie Secure, lockout/IP). → **PROB-0038** |
| 3 | Rotação de refresh desloga sob concorrência | 🔴 | **FUTURO** | tabela `refresh_tokens` e rotação não existem ainda. → **BACKLOG-0009** |
| 4 | Duas fontes de verdade p/ `updated_at` | 🔴 | **CONFIRMADO** | `@UpdateDateColumn` (relógio app) + trigger `set_updated_at` (relógio DB) ativos juntos. → **PROB-0039** |
| 5 | Cálculo monetário com `number` do JS | 🔴 | **PARCIAL** | `finance.service.ts:157` já usa `Math.round(x*100)/100`; agregações via SQL `SUM`. Risco residual em split/rateio. Relacionado **PROB-0036** (precisão decimal inconsistente). |
| 6 | Access token válido após logout/desativação | 🔴 | **FUTURO** | JWT nativo/`session_epoch` não existe. → **BACKLOG-0009** |
| 7 | "Deploy roda migrations" racy c/ réplicas | 🔴 | **FUTURO/infra** | 1 container hoje; risco só ao escalar. → **BACKLOG-0009** |
| 8 | Índices de FK ausentes | 🔴 | **REFUTADO** | migration 001 já cria `idx_*` para `transportadora_id`, `fornecedor_id`, `cliente_id`, `vendedor_id`, `pedido_id`, `produto_id`, `inadimplencia.cliente_id`. Só `refresh_tokens` (futuro) faltaria. |
| 9 | CSRF / efeito do `SameSite=Strict` | 🟡 | **FUTURO** | cookies nativos não existem. → **BACKLOG-0009** |
| 10 | Sem tabela de auditoria de eventos | 🟡 | **JÁ-REGISTRADO** | overlap **PROB-0032** (audit de PII/acesso). |
| 11 | Graceful shutdown + config de pool | 🟡 | **CONFIRMADO** | sem `app.enableShutdownHooks()` em `main.ts`; sem `extra:{max,...}` no TypeORM. → **BACKLOG-0009** (hardening) |
| 12 | Healthcheck causa loop de restart | 🟡 | **FUTURO/infra** | separar liveness/readiness na migração. → **BACKLOG-0009** |
| 13 | Headers de segurança do frontend | 🟡 | **FUTURO/infra** | nginx/NPM do WEB. → **BACKLOG-0009** |
| 14 | Política de senha / reset self-service | 🟡 | **FUTURO** | fluxo de senha nativo não existe. → **BACKLOG-0009** |
| 15 | Rate limit não escala horizontalmente | 🟡 | **FUTURO** | store compartilhado (Redis) só ao escalar. → **BACKLOG-0009** |
| 16 | PDF no cliente vs. servidor | 🔵 | **DECISÃO** | escolha de arquitetura; não é defeito atual. |
| 17 | LWW p/ edição interativa = perda silenciosa | 🔵 | **CONFIRMADO** | 0 `@VersionColumn` no projeto — sem optimistic locking. Edição web concorrente sobrescreve. → **PROB-0040** |
| 18 | Estratégia de rotação do `JWT_SECRET` | 🔵 | **FUTURO** | documentar na migração. → **BACKLOG-0009** |
| 19 | Testes da máquina de estados de auth | ⚙️ | **FUTURO** | auth nativa não existe. → **BACKLOG-0009** |
| 20 | Validadores de CNPJ/CEP ausentes | ⚙️ | **CONFIRMADO** | `create-client.dto.ts:17,24` só `@IsString()`; sem dígito verificador. → **PROB-0041** |
| 21 | Escopo de autorização no `/api/sync` | ⚙️ | **JÁ-REGISTRADO** | **PROB-0007** (sync sem RBAC). |
| 22 | `deleted_at` global filter + sync inclui deletados | ⚙️ | **PARCIAL** | `@DeleteDateColumn` presente (filtro automático); sync usa SQL cru — checar que inclui soft-deleted de propósito. Baixo. → **BACKLOG-0009** |
| 23 | CI mínima (lint+test+build) | ⚙️ | **FUTURO/infra** | não bloqueante. → **BACKLOG-0009** |

## O que foi corrigido

Nada de código — registro read-only. `PossiveisErros.md` mantido como está (fonte original do usuário).

## O que ficou pendente

- **5 defeitos confirmados no código atual** registrados: PROB-0037, PROB-0038, PROB-0039, PROB-0040, PROB-0041.
- **Hardening da migração auth** (itens FUTURO) consolidado em BACKLOG-0009.
- Correções delegadas a `backend-engineer` / `database-engineer` / `frontend-engineer` conforme cada PROB.

## Recomendação final

Os apontamentos 1, 2, 4 entram no **mesmo PR da migração baseline** (integridade/segurança, não opcional). 17 e 20 na Fase 1. Itens FUTURO seguem BACKLOG-0009 dobrado dentro das Fases 0/1/2 do prompt. Refutado: #8 (índices de FK já existem) — não gastar esforço.
