# BACKLOG — Renowa

Próximos passos e itens não tratados agora. Mantido pelo `docs-reporter`. IDs `BACKLOG-NNNN`. Referência cruzada com [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) por ID.

**Estado atual (2026-07-12): 6 itens abertos.** Relatórios, planos e prompts em outros arquivos são históricos; execução deve partir deste backlog e do `PROBLEM_LEDGER.md`.

## Formato de entrada

```
### BACKLOG-NNNN — <título>
- **Prioridade:** P0 | P1 | P2 | P3
- **Área:** backend | frontend | banco | segurança | LGPD | mobile | documentação | infra
- **Motivo:** por que é necessário
- **Dependências:** ... (ou "nenhuma")
- **Critério de aceite:** condição objetiva de pronto
- **Risco se ficar pendente:** ...
- **Status:** ABERTO | EM_ANDAMENTO | FECHADO
- **Relacionado:** PROB-NNNN / BUG-NNNN (se houver)
```

---

## Itens

### BACKLOG-0001 — Migrar cursor de sync de offset para `updated_at`
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** cursor de sync por offset (CHANGELOG #13) tem limitação conhecida — inserções/atualizações concorrentes durante a paginação podem pular ou repetir itens. Plano é migrar para cursor por `updated_at` na v2.0.
- **Dependências:** definição de âncora temporal estável (já existe `server_time` em todo response — CHANGELOG #12).
- **Critério de aceite:** pull de sync usa cursor por `updated_at`; teste de regressão cobre concorrência (inserção durante paginação não perde item).
- **Risco se ficar pendente:** em volume alto de escrita concorrente, cliente mobile pode não receber registros ou receber duplicados.
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `a2b787d`)
- **Solução aplicada:** backend adotou alternativa superior ao cursor por `updated_at`: change feed monotônico com `revision`, keyset pagination e `highWatermark` estável. Testes cobrem paginação e concorrência. Migração/robustez do cliente permanece em BACKLOG-0005.
- **Relacionado:** PROB-0008, PROB-0018

### BACKLOG-0002 — Remover segredos do git e rotacionar credenciais
- **Prioridade:** P0
- **Área:** segurança
- **Motivo:** `backend/env_renowa.txt` com segredos de produção reais versionado (PROB-0002).
- **Dependências:** acesso ao provedor de DB e ao ZonaDevAuth para rotação.
- **Critério de aceite:** arquivo fora do índice e do histórico; `.gitignore` cobre o padrão; DB password, `RENOWA_JWT_SECRET` e `AUTH_INTERNAL_SECRET` rotacionados; deploy validado com novos segredos.
- **Risco se ficar pendente:** takeover total do DB e forja de JWT para qualquer tenant.
- **Status:** ABERTO
- **Relacionado:** PROB-0002

### BACKLOG-0003 — Whitelist de colunas por entidade no serviço de sync
- **Prioridade:** P0
- **Área:** backend
- **Motivo:** SQL injection de identificador + mass-assignment no push (PROB-0003, PROB-0019).
- **Dependências:** mapa de colunas graváveis por entidade.
- **Critério de aceite:** chaves do payload validadas/mapeadas contra whitelist; chave desconhecida rejeitada; teste cobre payload com chave maliciosa (`"`).
- **Risco se ficar pendente:** injeção de SQL e escrita cross-tenant por usuário autenticado.
- **Status:** FECHADO
- **Relacionado:** PROB-0003, PROB-0019

### BACKLOG-0004 — Reescrever migrations para schema completo e válido
- **Prioridade:** P0
- **Área:** banco
- **Motivo:** migration 001 não cria tabelas, tem sintaxe inválida e índice em coluna inexistente; `mobile_sessions`/`parceiros_comerciais` ausentes (PROB-0004/0005/0006/0013/0033).
- **Dependências:** decisão sobre modelo de `comissoes` (FK para pedido?) e RBAC (PROB-0034).
- **Critério de aceite:** deploy limpo em banco vazio com `synchronize:false` sobe sem erro; schema resultante == entidades; smoke test de sessão mobile e parceiros passa.
- **Risco se ficar pendente:** produção não sobe do zero; divergência dev↔prod mascara bugs.
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Solução aplicada:** baseline efetiva `0000_baseline.sql` cobre schema completo; runner aceita migrations de quatro dígitos; migrations legadas inválidas de três dígitos são ignoradas. PROB-0004/0005/0006/0013/0033 estão fechados.
- **Relacionado:** PROB-0004, PROB-0005, PROB-0006, PROB-0013, PROB-0033

### BACKLOG-0005 — Redesenhar cursor e resolução de conflito do sync
- **Prioridade:** P1
- **Área:** mobile / backend
- **Motivo:** cursor global entre entidades e avanço em falha causam perda de dados; LWW por relógio do device causa perda cross-device (PROB-0008/0009/0010/0018/0022).
- **Dependências:** backend monotônico concluído em BACKLOG-0001; resta adoção e robustez do cliente mobile.
- **Critério de aceite:** cursor por entidade, avançado só em página completa sem erro; pull não sobrescreve linha `synced=0`; conflito não usa relógio do device; testes de concorrência e clock skew.
- **Risco se ficar pendente:** perda silenciosa de dados do servidor e de edições locais.
- **Status:** ABERTO
- **Relacionado:** PROB-0008, PROB-0009, PROB-0010, PROB-0018, PROB-0022, BACKLOG-0001

### BACKLOG-0006 — Reforçar isolamento tenant na camada de banco (FKs compostas)
- **Prioridade:** P1
- **Área:** banco / segurança
- **Motivo:** código e migration foram concluídos no commit `be74446`; resta rollout seguro e comprovação contra PostgreSQL real das FKs compostas e do `tenant_id` em `tenant_role_permissions` (PROB-0011/0012 fechados com ressalva).
- **Dependências:** unique composto `(tenant_id, id)` nos pais; BACKLOG-0004.
- **Critério de aceite:** aplicar `0021_cross_tenant_foreign_keys.sql` em clone/staging; auditoria zerada; constraints validadas no catálogo; tentativa cross-tenant falha com `23503`; locks medidos antes de produção.
- **Risco se ficar pendente:** vazamento cross-tenant no nível de integridade.
- **Status:** ABERTO
- **Relacionado:** PROB-0011, PROB-0012, PROB-0026

### BACKLOG-0007 — Programa de conformidade LGPD
- **Prioridade:** P1
- **Área:** LGPD
- **Motivo:** sem erasure/anonimização, sem trilha de auditoria de PII, PII em cleartext no mobile (PROB-0030/0031/0032).
- **Dependências:** definição jurídica dos requisitos de titular.
- **Critério de aceite:** fluxo de anonimização/hard-delete por titular; audit log de acesso/alteração de PII; DB mobile criptografado; export/portabilidade avaliado.
- **Risco se ficar pendente:** não conformidade com LGPD (Arts. 18, 37, 46).
- **Status:** ABERTO
- **Relacionado:** PROB-0030, PROB-0031, PROB-0032

### BACKLOG-0008 — Varredura de robustez e limpeza de código morto
- **Prioridade:** P2
- **Área:** backend / frontend / mobile
- **Motivo:** saldo de robustez após fechamento de RBAC, auth duplicada e itens LOW web/backend. Restam itens mobile e precisão decimal de PROB-0036.
- **Dependências:** nenhuma.
- **Critério de aceite:** poison-items com dead-letter; mutex no `SyncService`; precisão decimal padronizada.
- **Risco se ficar pendente:** acúmulo de débito técnico e superfícies frágeis.
- **Status:** ABERTO
- **Relacionado:** PROB-0020, PROB-0021, PROB-0023, PROB-0024, PROB-0036

### BACKLOG-0009 — Hardening a incorporar no prompt de migração Auth Nativa
- **Prioridade:** P1
- **Área:** backend / segurança / infra
- **Motivo:** revisão de `Prompt_Auth_Nativa_Hardening_v1.md` (relatório `REVIEW_REPORTS/2026-07-08_security_review_auth-migration-prompt.md`) achou lacunas que só se materializam **depois** da migração (código ainda não existe), logo não viram PROB — mas precisam entrar nas Fases 0/1/2 do prompt antes de executar. Itens: rotação de refresh sob concorrência (`SELECT ... FOR UPDATE` + janela de graça ~10s), invalidação instantânea de access token (`session_epoch`/`token_version` no JWT revalidado no guard), CSRF/`SameSite` do cookie de access, política mínima de senha, rotação do `JWT_SECRET`, testes e2e da máquina de estados de auth (login→refresh→reuse→logout→403), throttler com store compartilhado ao escalar, migrations como passo one-shot (advisory lock) antes do `up -d`, `enableShutdownHooks()` + config explícita de pool TypeORM, liveness/readiness separados (`@nestjs/terminus`), headers de segurança no nginx do WEB (HSTS/CSP/etc.), sync inclui soft-deleted de propósito, CI mínima (lint+test+build).
- **Dependências:** BACKLOG-0004 (migration baseline); decisão de topologia de cookies (Opção A same-origin vs B).
- **Critério de aceite:** cada item ou implementado na fase correspondente da migração, ou registrado como decisão consciente no `doc.md` da migração; testes e2e de auth cobrindo rotação/reuse/logout/403 passam.
- **Risco se ficar pendente:** logout falso sob concorrência, janela de token válido após logout/desativação, CSRF, senhas fracas, produção racy ao escalar — as defesas do prompt não funcionam de fato.
- **Status:** PARCIALMENTE_RESOLVIDO
- **Atualizado em:** 2026-07-12
- **Implementado:** rotação de refresh transacional com `FOR UPDATE`, graça de 10s e detecção de reuse; HS256 explícito; senha mínima de 12 caracteres com complexidade; shutdown hooks; pool TypeORM explícito; advisory lock já usado no runner; endpoints separados de liveness/readiness; HSTS/CSP/Permissions-Policy no nginx; CORS fail-fast em produção.
- **Saldo:** invalidação imediata de access token por epoch/version, estratégia operacional de rotação de segredos, readiness com probe real de DB, throttler compartilhado ao escalar, contrato/teste de soft-deleted no sync e CI funcional com ESLint instalado.
- **Resolvido fora deste backlog:** PROB-0040 fechado em 2026-07-12; optimistic concurrency aplicada às edições web. Mobile/sync permanece em PROB-0022/BACKLOG-0005.
- **Relacionado:** PROB-0037, PROB-0038, PROB-0039, PROB-0041, PROB-0032
