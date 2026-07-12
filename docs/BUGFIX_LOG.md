# BUGFIX_LOG — Renowa

Registro de bugs corrigidos. Mantido pelo `docs-reporter`. IDs `BUG-NNNN`. Referência cruzada com [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) por ID.

## Formato de entrada

```
### BUG-NNNN — <título>
- **Problema relacionado:** PROB-NNNN (ou "—")
- **Data:** YYYY-MM-DD
- **Área:** backend | frontend | banco | segurança | LGPD | mobile | documentação | infra
- **Sintoma:** ...
- **Causa raiz:** ...
- **Correção aplicada:** ...
- **Arquivos alterados:** `caminho:linha`
- **Testes/validações executadas:** comando + resultado real
- **Resultado:** PASS | PASS_COM_RESSALVA | FAIL | NÃO_EXECUTADO
- **Ressalvas:** ...
- **Commit:** <hash> (ou "commit: pendente")
```

---

## Bugs corrigidos

### BUG-0001 — Corrigida referência pendente `software-engineer` no software-architect
- **Problema relacionado:** PROB-0001
- **Data:** 2026-07-08
- **Área:** documentação
- **Sintoma:** `software-architect.md` delegava a `software-engineer` (agente inexistente).
- **Causa raiz:** referência não atualizada após remoção do agente genérico.
- **Correção aplicada:** 3 referências reescritas para o engenheiro de domínio (`backend-engineer` / `frontend-engineer` / `mobile-engineer` / `database-engineer`).
- **Arquivos alterados:** `.claude/agents/software-architect.md:8`, `:62`, `:70`
- **Testes/validações executadas:** `grep -n software-engineer .claude/agents/` → 0 ocorrências após o fix.
- **Resultado:** PASS
- **Ressalvas:** nenhuma. Alteração restrita a arquivo de agente; nenhum código de aplicação tocado.
- **Commit:** pendente

### BUG-0002 — Segredos de produção removidos do índice + `.gitignore` estendido
- **Problema relacionado:** PROB-0002
- **Data:** 2026-07-12
- **Área:** segurança / infra
- **Sintoma:** `backend/env_renowa.txt` (DATABASE_URL, RENOWA_JWT_SECRET, AUTH_INTERNAL_SECRET reais) rastreado no git.
- **Causa raiz:** `.gitignore` cobria só `.env*`; `env_renowa.txt` não casava o padrão.
- **Correção aplicada:** arquivo removido do índice; `.gitignore` estendido com `env_*.txt` e `backend/env_renowa.txt`.
- **Arquivos alterados:** `.gitignore:24-25`; `backend/env_renowa.txt` (removido do índice)
- **Testes/validações executadas:** `git ls-files | grep -i env_renowa` → sem saída (não rastreado).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** **rotação de segredos não verificada.** Se o arquivo esteve no histórico do git, os segredos seguem comprometidos — remover do HEAD não purga histórico. Rotacionar senha DB + RENOWA_JWT_SECRET + AUTH_INTERNAL_SECRET e purgar histórico antes de deploy. Por isso PROB-0002 está FECHADO_COM_RESSALVA.
- **Commit:** `85f7867`

### BUG-0003 — Whitelist de campos por entidade no push de sync (fecha SQL injection de identificador)
- **Problema relacionado:** PROB-0003
- **Data:** 2026-07-12
- **Área:** backend / segurança
- **Sintoma:** colunas do INSERT/UPDATE de sync vinham de `Object.keys(payload)` do cliente, interpoladas no SQL sem validação — chave maliciosa injeta SQL.
- **Causa raiz:** `payload` era record livre; ValidationPipe não filtra chaves de record.
- **Correção aplicada:** whitelist estática `PAYLOAD_FIELDS` por entidade + `validatePayload` chamado antes do build SQL; chave desconhecida → `BadRequestException`.
- **Arquivos alterados:** `backend/src/sync/sync.service.ts:32` (`PAYLOAD_FIELDS`), `:120` (chamada), `:201` (`validatePayload`)
- **Testes/validações executadas:** leitura do fluxo — validação (`:120`) precede resolução de FK (`:153`) e SQL (`:189-194`). `grep -n validatePayload` confirma call site.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** SQL ainda interpola identificador por string; seguro só enquanto `PAYLOAD_FIELDS` for estático. Não adicionar chaves dinâmicas.
- **Commit:** `85f7867`

### BUG-0004 — Baseline de schema completa (`0000_baseline.sql`) substitui migration inicial quebrada
- **Problema relacionado:** PROB-0004, PROB-0013
- **Data:** 2026-07-12
- **Área:** banco
- **Sintoma:** `001_initial_schema.sql` não criava nenhuma tabela; deploy limpo falhava `relation does not exist`. `mobile_sessions` e `parceiros_comerciais` ausentes de toda migration.
- **Causa raiz:** tabelas nasciam de `synchronize` em dev, nunca portadas para DDL.
- **Correção aplicada:** `0000_baseline.sql` (pg_dump, 17 `CREATE TABLE`, todas as tabelas core + RBAC + `mobile_sessions` + `parceiros_comerciais` + `refresh_tokens`). Runner `migrate.ts:6` aplica só arquivos `^\d{4}_` (4 dígitos) → só a baseline roda; `001`–`006` legados são ignorados.
- **Arquivos alterados:** `backend/src/database/migrations/0000_baseline.sql` (novo); `backend/src/database/migrate.ts`
- **Testes/validações executadas:** `grep -c "CREATE TABLE" 0000_baseline.sql` → 17; lista de tabelas inclui `mobile_sessions`, `parceiros_comerciais`; teste do regex do runner → só `0000_baseline.sql` casa.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** migrations legadas `001`–`006` seguem versionadas mas nunca rodam — remover/arquivar (BACKLOG-0004). Baseline por pg_dump precisa regeneração a cada mudança de schema. Migrations de auth nativa (`005`/`006`) também ignoradas, mas a baseline já contém o schema de auth nativa.
- **Commit:** `85f7867`

### BUG-0005 — Sintaxe `ADD CONSTRAINT IF NOT EXISTS` inválida deixou de rodar
- **Problema relacionado:** PROB-0005
- **Data:** 2026-07-12
- **Área:** banco
- **Sintoma:** `ADD CONSTRAINT IF NOT EXISTS` aborta no Postgres; migration inicial falhava.
- **Causa raiz:** sintaxe inválida no `001_initial_schema.sql:135,139`.
- **Correção aplicada:** baseline declara constraints com sintaxe válida; `001` (que contém a sintaxe inválida) não é mais aplicado pelo runner.
- **Arquivos alterados:** resolvido via `0000_baseline.sql` + regra do runner (nenhuma edição no `001`).
- **Testes/validações executadas:** `grep -rn "ADD CONSTRAINT IF NOT EXISTS" migrations/` → 2 hits, ambos em `001` (ignorado).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sintaxe inválida ainda presente no `001` legado — remover na limpeza.
- **Commit:** `85f7867`

### BUG-0006 — Índice sobre coluna inexistente `comissoes(pedido_id)` deixou de rodar
- **Problema relacionado:** PROB-0006
- **Data:** 2026-07-12
- **Área:** banco
- **Sintoma:** `CREATE INDEX ... ON comissoes(pedido_id)` sobre coluna que não existe; migration erra.
- **Causa raiz:** índice em coluna inexistente no `001:121`.
- **Correção aplicada:** baseline cria `comissoes` sem `pedido_id`, com índices válidos (`tenant_id, data_pedido`); `001` não roda.
- **Arquivos alterados:** resolvido via `0000_baseline.sql` + regra do runner.
- **Testes/validações executadas:** `grep -rn "comissoes(pedido_id)" migrations/` → 1 hit só no `001` (ignorado); baseline só tem índice válido.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** definição inválida ainda no `001` legado. Reavaliar drift de índices PROB-0033 contra a baseline.
- **Commit:** `85f7867`

### BUG-0007 — Optimistic concurrency nas edições web
- **Problema relacionado:** PROB-0040
- **Data:** 2026-07-12
- **Área:** backend / frontend / banco
- **Sintoma:** última edição web sobrescrevia silenciosamente alteração concorrente em pedidos e dados financeiros.
- **Causa raiz:** entidades sem versão e updates feitos após leitura com `repository.save()`.
- **Correção aplicada:** `VersionedBaseEntity` com `@VersionColumn`; updates e soft deletes condicionais por `uuid + tenant_id + version + deleted_at IS NULL`; incremento atômico; distinção tenant-safe entre `404` e `409 CONCURRENT_MODIFICATION`; filtro global preserva metadados; frontend envia versão, recarrega dados e mostra conflito inline.
- **Contrato 409:** `error.code=CONCURRENT_MODIFICATION`, `resource`, `resourceId`, `expectedVersion`, `currentVersion`.
- **Arquivos alterados:** entidades/DTOs/controllers/services de pedidos e financeiro; `versioned-base.entity.ts`; `optimistic-concurrency.ts`; `concurrent-modification.exception.ts`; filtro global; migration `0007_optimistic_concurrency.sql`; tipos, serviço de pedidos e tela financeira no frontend.
- **Migration:** adiciona `version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)` em `pedidos`, `financeiro_movimentacao`, `comissoes`, `parceiros_comerciais`, `inadimplencia`. Deve rodar antes da nova API.
- **Testes/validações executadas:** backend build PASS; frontend build PASS; Jest `11 suites / 22 tests` PASS; `git diff --check` sem erro.
- **Resultado:** PASS
- **Ressalvas:** mobile/sync fora do escopo por decisão do produto. `OrderItem` não tem edição web independente.
- **Commit:** pendente
