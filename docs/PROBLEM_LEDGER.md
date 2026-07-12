# PROBLEM_LEDGER — Renowa

Registro central de problemas. Mantido pelo `docs-reporter`. IDs sequenciais (`PROB-NNNN`), sem colisão. Referência cruzada com [BUGFIX_LOG.md](BUGFIX_LOG.md) e [BACKLOG.md](BACKLOG.md) por ID.

**Não registrar suposição como fato.** O que não foi verificado é marcado como suposição.

## Formato de entrada

```
### PROB-NNNN — <título claro>
- **Data:** YYYY-MM-DD
- **Origem:** revisão | auditoria | bug report | teste | implementação | usuário
- **Severidade:** BLOCKER | HIGH | MEDIUM | LOW
- **Status:** ABERTO | EM_ANDAMENTO | FECHADO | FECHADO_COM_RESSALVA | NÃO_REPRODUZIDO
- **Área:** backend | frontend | banco | segurança | LGPD | mobile | documentação | infra
- **Sintoma:** o que se observa
- **Causa raiz:** confirmada, ou "provável: ..." / "desconhecida"
- **Impacto técnico:** o que quebra / risco
- **Arquivos/módulos:** `caminho:linha`
- **Solução proposta:** ...
- **Solução aplicada:** ... (ou "nenhuma ainda")
- **Evidências/comandos:** ...
- **Riscos residuais:** ...
- **Próximo passo:** ...
- **Relacionado:** BUG-NNNN / BACKLOG-NNNN (se houver)
```

---

## Problemas

### PROB-0001 — Referência pendente a agente inexistente `software-engineer`
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** LOW
- **Status:** FECHADO
- **Área:** documentação
- **Sintoma:** `software-architect.md` delegava para um agente `software-engineer` que não existe no conjunto (removido ao espelhar do nexos-erp).
- **Causa raiz:** confirmada — referência não atualizada quando o agente genérico `software-engineer` foi removido em favor dos engenheiros de domínio.
- **Impacto técnico:** delegação apontava para alvo inexistente; roteamento de tarefa quebrado no papel.
- **Arquivos/módulos:** `.claude/agents/software-architect.md:8`, `:62`, `:70`
- **Solução proposta:** apontar para o engenheiro de domínio (`backend-engineer` / `frontend-engineer` / `mobile-engineer` / `database-engineer`).
- **Solução aplicada:** as 3 referências foram corrigidas.
- **Evidências/comandos:** `grep -n software-engineer .claude/agents/` (3 ocorrências antes; 0 depois).
- **Riscos residuais:** nenhum.
- **Próximo passo:** nenhum.
- **Relacionado:** BUG-0001

---

## Auditoria completa do sistema — 2026-07-08

Origem: auditoria read-only de todo o sistema (backend, frontend, mobile, banco, segurança/LGPD) via 5 subagentes especialistas. Relatório consolidado: [REVIEW_REPORTS/2026-07-08_full_system_audit.md](REVIEW_REPORTS/2026-07-08_full_system_audit.md). Nenhum código alterado.

> **Verificação 2026-07-12** — os 5 BLOCKERs (PROB-0002 a PROB-0006) foram reverificados contra o código atual e **fechados**. Todos resolvidos pelo commit `85f7867` (`feat(deploy): harden production rollout`, 2026-07-12). Mecanismo comum das migrations: o runner `backend/src/database/migrate.ts:6` só aplica arquivos que casam `^\d{4}_[a-z0-9_-]+\.sql$` (**exatamente 4 dígitos**). Só `0000_baseline.sql` (pg_dump completo, 17 tabelas) casa; as migrations legadas `001`–`006` (3 dígitos) são **ignoradas** pelo runner — por isso os bugs que estavam no `001` deixaram de rodar. Referência cruzada: BUG-0002 a BUG-0006.

### PROB-0002 — Segredos de produção reais versionados no git (`env_renowa.txt`)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** BLOCKER
- **Status:** FECHADO_COM_RESSALVA
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** segurança
- **Sintoma:** `backend/env_renowa.txt` está rastreado no git (`git ls-files` confirma) contendo `DATABASE_URL` (host/porta/usuário/senha do Postgres de produção), `RENOWA_JWT_SECRET` (chave HS256 real de 256 bits) e `AUTH_INTERNAL_SECRET`.
- **Causa raiz:** confirmada — `.gitignore` cobre apenas `.env*` (linhas 13-17); o nome `env_renowa.txt` não casa com o padrão.
- **Impacto técnico:** takeover total do DB; qualquer um com acesso ao repo forja JWT mobile de 30 dias para **qualquer tenant/roles** — colapsa toda a fronteira multi-tenant.
- **Arquivos/módulos:** `backend/env_renowa.txt`, `.gitignore:13`
- **Solução proposta:** `git rm --cached backend/env_renowa.txt`, adicionar ao `.gitignore`, **rotacionar todos os segredos** (senha DB, RENOWA_JWT_SECRET, AUTH_INTERNAL_SECRET) e purgar histórico do git.
- **Solução aplicada:** arquivo removido do índice e `.gitignore` estendido — agora cobre `env_*.txt` (linha 24) e `backend/env_renowa.txt` (linha 25). `git ls-files | grep env_renowa` → vazio (não rastreado). Aplicado no commit `85f7867`.
- **Evidências/comandos:** `git ls-files | grep -i env_renowa` → sem saída; `grep -n env .gitignore` → linhas 24-25 cobrem o padrão.
- **Riscos residuais:** **rotação de segredos NÃO verificada e provavelmente pendente.** Se o arquivo esteve no histórico do git (commits anteriores), os segredos seguem comprometidos mesmo removidos do índice — remover do HEAD não purga o histórico. Purge do histórico não confirmado.
- **Próximo passo:** verificar `git log --all -- backend/env_renowa.txt`; se houve versionamento prévio, **rotacionar senha DB + RENOWA_JWT_SECRET + AUTH_INTERNAL_SECRET** e purgar histórico antes de qualquer deploy. Enquanto não feito, o risco de takeover permanece — por isso FECHADO_COM_RESSALVA, não FECHADO.
- **Relacionado:** BACKLOG-0002, BUG-0002

### PROB-0003 — SQL injection de identificador no push de sync
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** backend / segurança
- **Sintoma:** UPDATE monta `"${k}" = $n` e INSERT monta a lista de colunas a partir das **chaves do payload do cliente** (`Object.keys(resolved)`). Valores são parametrizados (`$n`), mas identificadores não. Chave contendo `"` escapa da citação e injeta SQL.
- **Causa raiz:** confirmada — `payload` é `@IsObject()` sem validação de chaves (`sync.dto.ts:36`); o `whitelist/forbidNonWhitelisted` do ValidationPipe não remove chaves de um record livre.
- **Impacto técnico:** usuário autenticado (sessão mobile) injeta SQL arbitrário / escrita cross-tenant. Também permite mass-assignment de colunas arbitrárias.
- **Arquivos/módulos:** `backend/src/sync/sync.service.ts:130-143`, `:165-172`, `:109`; DTO `backend/src/sync/dto/sync.dto.ts:36`
- **Solução proposta:** whitelist de colunas permitidas por entidade (mapear payload → colunas conhecidas) antes de montar SQL; rejeitar chaves desconhecidas; validar `^[a-z_]+$`.
- **Solução aplicada:** whitelist inicial do commit `85f7867` foi consolidada na política tipada `SYNC_ENTITY_POLICIES`. Tabelas, colunas graváveis e colunas internas de FK vêm somente dessa política; `quoteIdentifier` rejeita qualquer identificador fora de `^[a-z_]+$`; valores seguem parametrizados. Chaves desconhecidas são rejeitadas antes de qualquer SQL.
- **Evidências/comandos:** teste de invariantes valida todos os identificadores da política; teste de payload malicioso cobre escape por `"`; suíte sync 32/32 e backend 68/68.
- **Riscos residuais:** identificadores SQL permanecem dinâmicos, mas agora são derivados exclusivamente da política tipada `SYNC_ENTITY_POLICIES` e validados por `quoteIdentifier`; valores permanecem parametrizados.
- **Próximo passo:** manter teste de invariantes da política ao adicionar entidades ou campos de sync.
- **Relacionado:** PROB-0019, BACKLOG-0003, BUG-0003

### PROB-0004 — Migration 001 não cria nenhuma tabela de negócio
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** banco
- **Sintoma:** `001_initial_schema.sql` só cria triggers, sequence, índices e constraints — assume que as 10 tabelas core já existem. Deploy limpo em produção (`synchronize:false`) falha imediatamente (`relation does not exist`).
- **Causa raiz:** confirmada — tabelas eram criadas por `synchronize` em dev e nunca portadas para DDL. Prod (schema por migration) diverge de dev.
- **Impacto técnico:** produção não sobe do zero. `mobile_sessions` e `parceiros_comerciais` também ausentes de toda migration (ver PROB-0013).
- **Arquivos/módulos:** `backend/src/database/migrations/001_initial_schema.sql`; `app.module.ts:48` (`synchronize` off só em prod)
- **Solução proposta:** adicionar `CREATE TABLE` de todas as tabelas core + `mobile_sessions` + `parceiros_comerciais` + RBAC antes de triggers/índices.
- **Solução aplicada:** nova baseline `0000_baseline.sql` (pg_dump completo) com **17 `CREATE TABLE`** cobrindo todas as tabelas core + `mobile_sessions` + `parceiros_comerciais` + RBAC + `refresh_tokens` (auth nativa). O runner `migrate.ts` só aplica arquivos `^\d{4}_` (4 dígitos), então a baseline é a única migration efetiva e o `001` quebrado deixou de rodar. Aplicado no commit `85f7867`. Fecha também PROB-0013.
- **Evidências/comandos:** `grep -c "CREATE TABLE" 0000_baseline.sql` → 17; teste do regex do runner contra os nomes de arquivo → só `0000_baseline.sql` casa, `001`–`006` ignorados.
- **Riscos residuais:** os arquivos legados `001`–`006` (sintaxe quebrada e migrations de auth nativa) seguem versionados mas **nunca rodam** — fonte de confusão; ver débito de limpeza em BACKLOG-0004. Baseline por pg_dump precisa ser regenerada quando o schema mudar.
- **Próximo passo:** remover/arquivar as migrations legadas `001`–`006` para não induzir a erro.
- **Relacionado:** PROB-0005, PROB-0006, PROB-0013, BACKLOG-0004, BUG-0004

### PROB-0005 — `ADD CONSTRAINT IF NOT EXISTS` é sintaxe inválida no PostgreSQL
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** banco
- **Sintoma:** `ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS ...` aborta com erro de sintaxe — PostgreSQL não suporta `IF NOT EXISTS` em `ADD CONSTRAINT`.
- **Causa raiz:** confirmada — sintaxe inválida.
- **Impacto técnico:** migration 001 aborta.
- **Arquivos/módulos:** `backend/src/database/migrations/001_initial_schema.sql:134-139`
- **Solução proposta:** remover a cláusula ou envolver em bloco `DO $$ ... IF NOT EXISTS (SELECT FROM pg_constraint ...) $$`.
- **Solução aplicada:** a sintaxe inválida remanesce **apenas** no `001_initial_schema.sql:135,139`, que o runner ignora (arquivo de 3 dígitos, ver PROB-0004). A baseline `0000_baseline.sql` declara constraints com sintaxe válida (`ADD CONSTRAINT "nome" UNIQUE/FOREIGN KEY`), sem `IF NOT EXISTS`. Como o `001` nunca roda, o abort deixou de ocorrer. Commit `85f7867`.
- **Evidências/comandos:** `grep -rn "ADD CONSTRAINT IF NOT EXISTS" migrations/` → 2 hits, ambos em `001` (arquivo ignorado pelo runner).
- **Riscos residuais:** o `001` com sintaxe inválida segue no repo — se um dia for renomeado para 4 dígitos ou aplicado manualmente, volta a abortar. Remover na limpeza de legado (BACKLOG-0004).
- **Próximo passo:** arquivar `001`–`006` junto de PROB-0004.
- **Relacionado:** PROB-0004, BUG-0005

### PROB-0006 — Índice em coluna inexistente `comissoes.pedido_id`
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** banco
- **Sintoma:** `CREATE INDEX idx_comissoes_pedido ON comissoes(pedido_id)` mas a entidade `Commission` não tem `pedido_id` (só `cliente_id`, `fornecedor_id`, `numero_pedido varchar`).
- **Causa raiz:** confirmada — índice referencia coluna inexistente.
- **Impacto técnico:** migration 001 erra mesmo após as tabelas existirem.
- **Arquivos/módulos:** `backend/src/database/migrations/001_initial_schema.sql:121`; `backend/src/**/commission.entity.ts`
- **Solução proposta:** remover o índice ou adicionar FK real `pedido_id`.
- **Solução aplicada:** o índice quebrado `comissoes(pedido_id)` remanesce **apenas** no `001:121` (arquivo ignorado pelo runner, ver PROB-0004). A baseline `0000_baseline.sql` cria `comissoes` sem `pedido_id` e com índices válidos, incluindo `(tenant_id, data_pedido)` — nenhum índice sobre coluna inexistente. Como o `001` nunca roda, o erro deixou de ocorrer. Commit `85f7867`.
- **Evidências/comandos:** `grep -rn "comissoes(pedido_id)" migrations/` → 1 hit, só em `001` (ignorado); baseline: `grep "comiss.*pedido"` → só índice `(tenant_id, data_pedido)`, válido.
- **Riscos residuais:** definição de índice inválida permanece no `001` legado — remover na limpeza (BACKLOG-0004). Drift de índices de `comissoes` (PROB-0033) deve ser reavaliado contra a baseline.
- **Próximo passo:** reavaliar PROB-0033 contra `0000_baseline.sql`.
- **Relacionado:** PROB-0004, PROB-0033, BUG-0006

### PROB-0007 — Endpoints de sync não aplicam RBAC
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** backend / segurança
- **Sintoma:** `POST /api/sync` e todos os `GET /api/sync/*` não têm `@Roles`/`@RequirePermission`. `PermissionGuard` retorna `true` quando nenhuma permissão é declarada.
- **Causa raiz:** confirmada — só os guards globais de auth rodam no caminho de sync.
- **Impacto técnico:** qualquer usuário autenticado (mesmo `viewer`) cria/atualiza/deleta pedidos, clientes, produtos via sync, contornando os checks de role/permissão dos controllers REST.
- **Arquivos/módulos:** `backend/src/sync/sync.controller.ts` (arquivo inteiro); `permission.guard.ts:55-60`
- **Solução proposta:** aplicar checagem de permissão por entidade/operação no caminho de sync.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura do controller (sem decorators de RBAC).
- **Riscos residuais:** combinado com PROB-0003 amplia a superfície de escrita indevida.
- **Próximo passo:** definir matriz permissão×entidade para sync.
- **Relacionado:** PROB-0003

### PROB-0008 — Cursor de sync único e global entre entidades causa perda silenciosa de dados
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** `fetchDeltas` mantém um único `latestServerTime = max(server_time)` sobre TODAS as 6 entidades e salva como um único `last_sync_timestamp`. Entidades são puxadas em sequência (T1..T5); próximo ciclo usa `since = T5` até para `clientes` (lido em T1). Linha de `clientes` alterada em (T1, T5] é filtrada para sempre.
- **Causa raiz:** confirmada — tempos de leitura por entidade colapsados em um cursor só.
- **Impacto técnico:** edições feitas no servidor são perdidas permanentemente no mobile.
- **Arquivos/módulos:** `mobile/src/services/SyncService.ts:144-174`, `:244`; `backend/src/sync/sync.service.ts:262`
- **Solução proposta:** cursor por entidade (map por chave de entidade), cada um ancorado ao `server_time` da própria última página.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `SyncService.ts` + `sync.service.ts`.
- **Riscos residuais:** agravado por PROB-0009 e PROB-0018.
- **Próximo passo:** redesenhar armazenamento de cursor de sync.
- **Relacionado:** PROB-0009, PROB-0018, BACKLOG-0001, BACKLOG-0005

### PROB-0009 — Entidade que falha no pull ainda avança o cursor compartilhado
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** em qualquer erro de pull o loop faz `hasMore=false` e segue, mas `latestServerTime` já avançou por entidades anteriores e é persistido. O `since` da entidade que falhou avança sem ter buscado nada.
- **Causa raiz:** confirmada — cursor compartilhado persistido mesmo com falha parcial.
- **Impacto técnico:** atualizações da entidade que falhou são puladas no ciclo seguinte.
- **Arquivos/módulos:** `mobile/src/services/SyncService.ts:167-169`, `:243-244`
- **Solução proposta:** só avançar o cursor de uma entidade se ela paginou completamente sem erro.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `SyncService.ts`.
- **Riscos residuais:** parte do mesmo redesenho de PROB-0008.
- **Próximo passo:** cursor por entidade transacional.
- **Relacionado:** PROB-0008

### PROB-0010 — Pull sobrescreve edições locais não sincronizadas quando o push falha
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** `runFullSync` roda `syncPendingItems()` e depois `fetchDeltas()` incondicionalmente, ignorando erro de push. `applyDeltas` sobrescreve todos os campos e seta `synced=1`, sem checar linhas locais sujas (`synced=0`).
- **Causa raiz:** confirmada — pull não respeita estado pendente local.
- **Impacto técnico:** se o push falhou (offline/erro), a linha do servidor recém-puxada sobrescreve o estado da edição pendente local; re-push pode reaplicar edição já abandonada.
- **Arquivos/módulos:** `mobile/src/services/SyncService.ts:235-241`, `:204-214`
- **Solução proposta:** não aplicar delta em linhas com item pendente na fila / `synced=0`; ou condicionar o pull a um push limpo.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `SyncService.ts`.
- **Riscos residuais:** interage com LWW por relógio do dispositivo (PROB-0022).
- **Próximo passo:** proteger linhas dirty no apply.
- **Relacionado:** PROB-0022

### PROB-0011 — FKs sem `tenant_id` composto permitem referência cross-tenant no nível do banco
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** banco / segurança
- **Sintoma:** todo `@ManyToOne` referencia apenas a coluna `id`; não há constraint composta `(tenant_id, <fk>_id)`. Uma linha do tenant A pode referenciar pai do tenant B — nada no DB impede.
- **Causa raiz:** confirmada — FKs não incluem `tenant_id`.
- **Impacto técnico:** vazamento cross-tenant na camada de integridade; ex.: `leftJoinAndSelect('c.fornecedor')` pode trazer `razao_social` de outro tenant.
- **Arquivos/módulos:** `order.entity.ts:31,41,48`; `client.entity.ts:61`; `product.entity.ts:13`; `inadimplencia.entity.ts:14`; `commission.entity.ts:22,29`; `parceiro.entity.ts:21,28`; `order-item.entity.ts:15,23`
- **Solução proposta:** FKs compostas `(tenant_id, cliente_id) REFERENCES clientes(tenant_id, id)` etc.; exige unique composto nos pais.
- **Solução aplicada:** nenhuma ainda. Delegado a `database-engineer` + `security-auditor`.
- **Evidências/comandos:** leitura das entidades.
- **Riscos residuais:** hoje mitigado só por disciplina de aplicação (services filtram tenant).
- **Próximo passo:** planejar migração de constraints compostas.
- **Relacionado:** PROB-0026, BACKLOG-0006

### PROB-0012 — Invariante "tenant_id em TODA tabela" violado em `tenant_role_permissions`
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** banco / segurança
- **Sintoma:** `tenant_role_permissions` não tem coluna `tenant_id` — é tenant-escopado só transitivamente via `role_id → tenant_roles.tenant_id`. `permissions` e `role_permissions` também sem `tenant_id`.
- **Causa raiz:** confirmada — tabelas de catálogo/junção não modeladas com `tenant_id`.
- **Impacto técnico:** viola a invariante declarada; isolamento depende sempre de join. `permissions`/`role_permissions` são plausivelmente catálogos globais intencionais (suposição), mas `tenant_role_permissions` é dado de tenant e deveria carregar `tenant_id`.
- **Arquivos/módulos:** `tenant-role-permission.entity.ts`; migration `003:33-39`; `permission.guard.ts:55-60`
- **Solução proposta:** adicionar `tenant_id` a `tenant_role_permissions` e filtrar explicitamente no `PermissionGuard`.
- **Solução aplicada:** nenhuma ainda. Delegado a `database-engineer` + `security-auditor`.
- **Evidências/comandos:** leitura das entidades RBAC e migration 003.
- **Riscos residuais:** hoje seguro porque `role_id` vem do `local_user` tenant-escopado — dependência implícita.
- **Próximo passo:** decidir modelo RBAC (ver PROB-0034 sobre dois modelos coexistentes).
- **Relacionado:** PROB-0034

### PROB-0013 — `mobile_sessions` e `parceiros_comerciais` ausentes de todas as migrations
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** banco
- **Sintoma:** nenhuma migration `.sql` cria essas tabelas, seus índices ou trigger de `updated_at`. Só existem via `synchronize` (dev).
- **Causa raiz:** confirmada — mesma origem de PROB-0004.
- **Impacto técnico:** em produção, revogação de sessão mobile e feature de parceiros quebram (tabelas inexistentes).
- **Arquivos/módulos:** `mobile-session.entity.ts`, `parceiro.entity.ts`; migrations `001`
- **Solução proposta:** adicionar DDL de ambas (colunas, índices, trigger).
- **Solução aplicada:** ambas presentes na baseline `0000_baseline.sql` — `CREATE TABLE public.mobile_sessions` e `CREATE TABLE public.parceiros_comerciais` entre as 17 tabelas do pg_dump. Fechada junto de PROB-0004. Commit `85f7867`.
- **Evidências/comandos:** `grep -oiE "CREATE TABLE public\.[a-z_]+" 0000_baseline.sql` → lista inclui `mobile_sessions` e `parceiros_comerciais`.
- **Riscos residuais:** trigger de `updated_at` dessas tabelas deve ser conferido na baseline (não reverificado neste passo).
- **Próximo passo:** confirmar triggers `set_updated_at` na baseline para ambas.
- **Relacionado:** PROB-0004, BUG-0004

### PROB-0014 — Casing de role divergente trava admin real (`ADMIN` vs `admin`)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** frontend
- **Sintoma:** `isAdmin()`/`hasPermission()` comparam com literal `'ADMIN'` (maiúsculo). `ROLE_OPTIONS` usa `['admin','manager','viewer']` (minúsculo) e `useAuth.ts` compara case-insensitive — dois verificadores discordam.
- **Causa raiz:** confirmada (inconsistência interna); casing real do backend = suposição.
- **Impacto técnico:** se o JWT emite `'admin'`, `isAdmin()` retorna false e a rota `adminOnly` `/configuracoes` redireciona um admin real para `/`.
- **Arquivos/módulos:** `frontend/src/context/AuthContext.tsx:70,75`; `hooks/useAuth.ts:7`; `pages/UsuariosPage.tsx:30`; `App.tsx:103`
- **Solução proposta:** normalizar casing num único helper compartilhado (comparação lowercase).
- **Solução aplicada:** nenhuma ainda. Delegado a `frontend-engineer`.
- **Evidências/comandos:** leitura dos arquivos de auth do frontend.
- **Riscos residuais:** relacionado a duas entradas de `useAuth` (PROB-0027).
- **Próximo passo:** unificar helper de role.
- **Relacionado:** PROB-0027

### PROB-0015 — AuthCallback trata falha como sucesso
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** frontend
- **Sintoma:** `await res.json()` seguido de `setStatus('success')` sem checar `res.ok`. Callback OIDC com falha (state mismatch, code expirado, 4xx/5xx) e sem `redirect` cai no fallback `window.location.href = '/dashboard'` reportando sucesso.
- **Causa raiz:** confirmada — status da resposta ignorado.
- **Impacto técnico:** usuário entra no app sem cookie válido → loop de redirect via tratamento de 401.
- **Arquivos/módulos:** `frontend/src/pages/AuthCallback.tsx:32-39`
- **Solução proposta:** checar `res.ok` e presença de `data.redirect`; senão exibir erro.
- **Solução aplicada:** nenhuma ainda. Delegado a `frontend-engineer`.
- **Evidências/comandos:** leitura de `AuthCallback.tsx`.
- **Riscos residuais:** nenhum além do loop.
- **Próximo passo:** tratamento de erro no callback.
- **Relacionado:** —

### PROB-0016 — `TenantSubscriber` nunca registrado — defesa em profundidade inexistente
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** backend / segurança
- **Sintoma:** `TenantSubscriber` não é registrado como provider nem instanciado por DI (grep confirma: só referências no próprio arquivo). O `cls.set('tenantId')` do interceptor não tem consumidor ativo — o único `cls.get` era esse subscriber.
- **Causa raiz:** confirmada — `grep -rn "TenantSubscriber" backend/src` retorna só `tenant.subscriber.ts:24` e `:39`.
- **Impacto técnico:** a proteção "injeta/valida tenant_id em todo INSERT" descrita na memória do projeto **não existe**. Isolamento depende 100% de cada service passar `tenantId` manualmente (hoje passam). Sync usa `INSERT` cru — nunca passaria por subscriber de qualquer forma. Interceptor+CLS são efetivamente código morto. **Corrige afirmação falsa em SYSTEM_OVERVIEW e DIAGRAMS.**
- **Arquivos/módulos:** `backend/src/common/subscribers/tenant.subscriber.ts`; `tenant-context.interceptor.ts:27-28`
- **Solução proposta:** registrar `TenantSubscriber` como provider de módulo, OU remover interceptor/subscriber mortos para não dar falsa sensação de proteção.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** `grep -rn "TenantSubscriber" backend/src` → 2 hits (mesmo arquivo).
- **Riscos residuais:** nota: o agente de segurança assumiu que o subscriber protegia — **assunção incorreta**, refutada por este grep.
- **Próximo passo:** decidir registrar vs remover.
- **Relacionado:** —

### PROB-0017 — `GlobalExceptionFilter` vaza `exception.message` cru em erros 500
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** segurança
- **Sintoma:** para qualquer não-`HttpException` (500), o `exception.message` cru volta no body JSON, junto de `request.url`.
- **Causa raiz:** confirmada.
- **Impacto técnico:** vazamento de strings internas/de DB (info disclosure).
- **Arquivos/módulos:** `backend/src/common/filters/global-exception.filter.ts:53-55`, `:60-67`
- **Solução proposta:** mensagem genérica para 500; detalhes só no log do servidor.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura do filter.
- **Riscos residuais:** nenhum.
- **Próximo passo:** sanitizar resposta de 500.
- **Relacionado:** —

### PROB-0018 — `server_time` capturado após a query abre janela de lost-update
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Área:** backend / mobile
- **Sintoma:** `server_time` = `new Date().toISOString()` gerado na montagem da resposta, estritamente após o SELECT. Linha alterada entre o snapshot do SELECT e o `server_time` fica de fora desta resposta mas é excluída no ciclo seguinte (`since` já passou).
- **Causa raiz:** confirmada — âncora tomada depois da leitura, não derivada do `MAX(updated_at)` das linhas retornadas.
- **Impacto técnico:** perde atualização na janela entre leitura e resposta.
- **Arquivos/módulos:** `backend/src/sync/sync.service.ts:279`; `mobile/src/services/SyncService.ts:164-165`
- **Solução proposta:** substituir timestamp/offset por change feed monotônico.
- **Solução aplicada:** sync v2 com trigger transacional em `sync_outbox`; drain serializado por advisory lock atribui `revision` somente após commit; pull usa keyset `revision`, `highWatermark` estável e `limit + 1`; bigint trafega como string; mobile guarda cursor por entidade e aplica página + cursor na mesma transação SQLite. API v1 mantida durante migração.
- **Evidências/comandos:** migration `0008_sync_change_feed.sql`; testes backend 28/28; build backend; `tsc --noEmit` mobile.
- **Riscos residuais:** migration precisa ser aplicada em cada ambiente; retenção/compactação de `sync_changes` ainda requer política operacional.
- **Próximo passo:** rollout gradual do mobile v2 e monitoramento do tamanho do feed.
- **Relacionado:** PROB-0008, BACKLOG-0001

### PROB-0019 — Sync aceita `*_id` cru e sobrescreve colunas server-controlled (mass-assignment)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** backend / segurança
- **Sintoma:** `resolvePayloadFKs` só mapeia/remove chaves `*_uuid`; qualquer `*_id` cru (ex.: `cliente_id`, `vendedor_id`) passa direto sem validação de tenant. UPDATE exclui só `id/uuid/tenant_id` — cliente pode sobrescrever `numero_pedido` (sequence server) e outras colunas.
- **Causa raiz:** confirmada.
- **Impacto técnico:** referência FK cross-tenant armazenada; cliente reescreve campos gerenciados pelo servidor.
- **Arquivos/módulos:** `backend/src/sync/sync.service.ts:181-234`, `:217-224`
- **Solução proposta:** whitelist de colunas graváveis por entidade; validar propriedade da FK por tenant.
- **Solução aplicada:** política única e tipada `SYNC_ENTITY_POLICIES` define tabela, campos graváveis, campos server-controlled, FKs, tabela-alvo e nulabilidade para as seis entidades. Validação, resolução tenant-safe e persistência derivam somente dessa política. Payload nunca fornece nomes de tabela/coluna; `quoteIdentifier` impõe `^[a-z_]+$`. `*_id`, campos server-controlled, UUID malformado, FK fora do tenant, FK obrigatória ausente e `null` proibido são rejeitados. FKs opcionais aceitam `null` explícito.
- **Evidências/comandos:** `npm test --workspace=backend -- sync --runInBand` — 32/32; suíte backend completa — 68/68; `npm run build --workspace=backend` passou. `sync.service.spec.ts` cobre as seis entidades, todas as FKs, campos server-controlled, SQL injection, chave herdada de objeto, UUID válido/malformado/fora do tenant, nulabilidade e invariantes da política. Lint não executou porque o workspace não possui pacote/configuração ESLint apesar do script existente.
- **Riscos residuais:** alterações futuras na política devem manter o teste de invariantes e compatibilidade do contrato de sync.
- **Próximo passo:** nenhum.
- **Relacionado:** PROB-0003, PROB-0011

### PROB-0020 — Itens "poison" nunca descartados; `retry_count` é campo morto
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** `dequeue` seleciona os 200 mais antigos sem filtrar `retry_count`; `incrementRetry` incrementa mas nada lê. Item que falha sempre (ex.: erro de validação do servidor) fica na cabeça da fila e é reenviado todo ciclo; `getPendingCount` nunca zera ("N pendentes" perpétuo).
- **Causa raiz:** confirmada.
- **Impacto técnico:** fila travada, UI mostra pendência eterna, tráfego desperdiçado.
- **Arquivos/módulos:** `mobile/src/storage/sync-queue.ts:30-43`, `:60-66`; `SyncService.ts:100-116`
- **Solução proposta:** threshold de max-retry (drop ou dead-letter) e/ou `WHERE retry_count < N ORDER BY id` no dequeue.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `sync-queue.ts`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** política de dead-letter.
- **Relacionado:** —

### PROB-0021 — Guard de sync por stale-closure + storm do NetInfo dispara syncs sobrepostos
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** `NetInfo.addEventListener` registrado em `useEffect([])` captura o `handleSync` de mount, cujo `syncing` fica sempre `false`; guard `if (syncing) return` é inefetivo para runs disparados pelo listener. NetInfo dispara em flaps; botão manual é outro caminho. Sem mutex interno, `runFullSync` concorrente → `dequeue(200)` retorna as mesmas linhas para dois pushes.
- **Causa raiz:** confirmada — closure obsoleta + ausência de re-entrância.
- **Impacto técnico:** CREATE é idempotente (dano limitado), mas UPDATE aplica em dobro e apply de delta interleaves.
- **Arquivos/módulos:** `mobile/src/screens/HomeScreen.tsx:19-48`; `SyncService` (sem mutex)
- **Solução proposta:** lock de re-entrância dentro de `SyncService` (promise in-flight); guard por ref, não por state de closure.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `HomeScreen.tsx` + `SyncService.ts`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** mutex em `SyncService`.
- **Relacionado:** —

### PROB-0022 — LWW baseado em relógio do dispositivo → perda de edição cross-device
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** backend / mobile
- **Sintoma:** `enqueue` carimba `client_timestamp = new Date()` (relógio do device). Servidor LWW compara `row.updated_at > client_timestamp`. Device com relógio adiantado sempre vence (sobrescreve dado mais novo); atrasado sempre perde (edição descartada em silêncio).
- **Causa raiz:** confirmada — "nunca confiar no relógio do device" aplicado ao cursor, mas não à resolução de conflito.
- **Impacto técnico:** perda de edição entre dispositivos sob clock skew.
- **Arquivos/módulos:** `mobile/src/storage/sync-queue.ts:26`; `backend/src/sync/sync.service.ts:123`, `:124-126`
- **Solução proposta:** servidor carimba tempo de recebimento ou usa relógio lógico/monotônico; ou rejeita timestamps com skew implausível.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer` + `mobile-engineer`.
- **Evidências/comandos:** leitura de ambos os arquivos.
- **Riscos residuais:** interage com PROB-0010.
- **Próximo passo:** rever estratégia de conflito.
- **Relacionado:** PROB-0010, BACKLOG-0005

### PROB-0023 — `applyDeltas` sem transação + SQL dinâmico com nomes de coluna do servidor
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** cada linha é um `runAsync` separado sem `BEGIN/COMMIT` — interrupção deixa batch parcial. Nomes de coluna vêm das chaves da resposta do servidor interpoladas no SQL; coluna nova ausente do schema local lança erro (engolido, parando a entidade).
- **Causa raiz:** confirmada.
- **Impacto técnico:** batch de delta parcialmente aplicado; entidade para em coluna desconhecida.
- **Arquivos/módulos:** `mobile/src/services/SyncService.ts:177-227`, `:208`, `:217`
- **Solução proposta:** `db.withTransactionAsync` em volta de `applyDeltas`; whitelist de colunas contra o schema local.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `SyncService.ts`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** transação + whitelist no apply.
- **Relacionado:** —

### PROB-0024 — `atob` pode ser undefined no Hermes → re-login forçado a cada abertura (suposição)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** `hasValidSession` decodifica o JWT com `atob`, não garantido no escopo global RN/Hermes (sem polyfill importado). Ausente → lança → capturado → retorna `false` → app vai para LoginScreen em todo cold start.
- **Causa raiz:** suposição — depende do SDK Expo alvo; não verificado em runtime.
- **Impacto técnico:** derrota o uso offline (re-login exige token ZonaDev fresco = internet).
- **Arquivos/módulos:** `mobile/src/services/ApiService.ts:67`, `:69`; `mobile/App.tsx:13-16`
- **Solução proposta:** verificar no SDK alvo; se ausente, usar `expo-crypto`/`base-64` ou decodificar manualmente.
- **Solução aplicada:** nenhuma ainda. Delegado a `mobile-engineer`.
- **Evidências/comandos:** leitura de `ApiService.ts`.
- **Riscos residuais:** precisa validação em runtime.
- **Próximo passo:** testar em build Expo alvo.
- **Relacionado:** —

### PROB-0025 — Rota `POST /api/auth/mobile-session` duplicada (placeholder que lança 500)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** backend
- **Sintoma:** dois `@Controller('auth')` declaram `@Post('mobile-session')`. O handler de `AuthController` faz `throw new Error(...)` (HTTP 500). O primeiro registrado (`AuthControllerImpl`) vence por ordem do Express — o que lança fica morto mas load-bearing na ordem de registro.
- **Causa raiz:** confirmada — controller placeholder deixado registrado.
- **Impacto técnico:** frágil; reordenar o array `controllers` quebra o login com 500.
- **Arquivos/módulos:** `backend/src/auth/auth.service.ts:48-70`; `auth.controller.ts:34-46`; `auth.module.ts:15`
- **Solução proposta:** remover o `createMobileSession` placeholder (mover `revokeSession`/`me` se necessário).
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura dos controllers + module.
- **Riscos residuais:** nenhum enquanto a ordem não mudar.
- **Próximo passo:** remover placeholder.
- **Relacionado:** —

### PROB-0026 — `fornecedor_id` do cliente não validado por tenant em Finance
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** backend / segurança
- **Sintoma:** `createComissao`/`createParceiro` gravam `dto.fornecedor_id` (id numérico cru) sem checar se pertence ao tenant (diferente de `cliente_uuid`, resolvido com filtro de tenant).
- **Causa raiz:** confirmada.
- **Impacto técnico:** comissão/parceiro do tenant A referencia fornecedor do tenant B; `leftJoinAndSelect('c.fornecedor')` expõe `razao_social` do outro tenant em relatórios.
- **Arquivos/módulos:** `backend/src/finance/finance.service.ts:147`, `:314`; `create-comissao.dto.ts:11-13`
- **Solução proposta:** resolver/validar fornecedor por uuid+tenant como é feito com clientes.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura de `finance.service.ts`.
- **Riscos residuais:** subconjunto de PROB-0011.
- **Próximo passo:** validar FK por tenant.
- **Relacionado:** PROB-0011

### PROB-0027 — Sistema de permissões granulares inoperante (`permissions` sempre `[]`)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** frontend
- **Sintoma:** `permissions` é hardcoded `[]` a cada load; resultado de `/auth/me` não é mapeado. `hasPermission(slug)` só retorna true para admin.
- **Causa raiz:** confirmada.
- **Impacto técnico:** hoje nenhuma rota passa `permission` (só `adminOnly`), mas o prop `permission` de `ProtectedRoute` é uma armadilha viva para uso futuro. Duas entradas de `useAuth` (context vs hook) aumentam o risco de drift.
- **Arquivos/módulos:** `frontend/src/context/AuthContext.tsx:45,55,69-72`; `ProtectedRoute.tsx:29`
- **Solução proposta:** popular permissions da API ou remover a superfície morta.
- **Solução aplicada:** nenhuma ainda. Delegado a `frontend-engineer`.
- **Evidências/comandos:** leitura de `AuthContext.tsx`.
- **Riscos residuais:** relacionado a PROB-0014.
- **Próximo passo:** decidir ativar vs remover.
- **Relacionado:** PROB-0014

### PROB-0028 — `apiClient` sem fallback `/api` para `VITE_API_URL`
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** frontend
- **Sintoma:** `const BASE_URL = import.meta.env.VITE_API_URL;` sem `?? '/api'`, enquanto todos os outros módulos usam default `/api`. Se `VITE_API_URL` não setada, chamadas de dados viram `/clientes` (404) mas auth ainda funciona — falha parcial difícil de diagnosticar.
- **Causa raiz:** confirmada — tratamento de env inconsistente.
- **Impacto técnico:** 404 em todas as chamadas de dados quando env ausente.
- **Arquivos/módulos:** `frontend/src/lib/apiClient.ts:3`, `:30`
- **Solução proposta:** default `BASE_URL` para `/api`.
- **Solução aplicada:** nenhuma ainda. Delegado a `frontend-engineer`.
- **Evidências/comandos:** leitura de `apiClient.ts`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** adicionar fallback.
- **Relacionado:** —

### PROB-0029 — `ProtectedRoute` faz redirect como efeito de render
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** frontend
- **Sintoma:** `window.location.href = ...` no corpo de render do componente. Pode disparar a cada re-render / duas vezes sob StrictMode.
- **Causa raiz:** confirmada — navegação como efeito de render.
- **Impacto técnico:** redirect churn; monta URL de start OIDC a cada render.
- **Arquivos/módulos:** `frontend/src/components/ProtectedRoute.tsx:20-23`
- **Solução proposta:** mover para `useEffect`.
- **Solução aplicada:** nenhuma ainda. Delegado a `frontend-engineer`.
- **Evidências/comandos:** leitura de `ProtectedRoute.tsx`.
- **Riscos residuais:** interage com 401 duplicado (PROB-0035).
- **Próximo passo:** refatorar para efeito.
- **Relacionado:** PROB-0035

### PROB-0030 — PII de clientes sem criptografia em repouso no SQLite mobile
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** LGPD
- **Sintoma:** `expo-sqlite` abre `renowa.db` em texto claro (sem SQLCipher). Tabela `clientes` guarda `cnpj`, `email`, `tel`, `endereco` em cleartext no dispositivo; toda a base de clientes do tenant é puxada via sync.
- **Causa raiz:** confirmada.
- **Impacto técnico:** exposição de dados-em-repouso (LGPD Art. 46) se o dispositivo for comprometido.
- **Arquivos/módulos:** `mobile/src/storage/database.ts:7`, `:49-60`; `backend/src/sync/sync.service.ts:245`
- **Solução proposta:** DB criptografado (SQLCipher / criptografia do expo-sqlite) para PII.
- **Solução aplicada:** nenhuma ainda. Delegado a `lgpd-auditor` + `mobile-engineer`.
- **Evidências/comandos:** leitura de `database.ts`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** avaliar SQLCipher no Expo.
- **Relacionado:** BACKLOG-0007

### PROB-0031 — Sem direito ao apagamento (LGPD Art. 18) — só soft delete
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** LGPD
- **Sintoma:** `base.entity.ts:16` afirma "dados nunca são apagados fisicamente"; só existe soft delete. PII de cliente (`cnpj`, `email`, `tel`, `endereco`, `contato`) e de usuário (`email`, `nome`) retida indefinidamente, sem caminho de erasure/anonimização.
- **Causa raiz:** confirmada — só `softDelete`.
- **Impacto técnico:** não há como honrar pedido de titular (Art. 18).
- **Arquivos/módulos:** `backend/src/common/entities/base.entity.ts:16`; `clients.service.ts:82-85`; `sync.service.ts:100-103`
- **Solução proposta:** fluxo de anonimização/hard-delete para requisição de titular.
- **Solução aplicada:** nenhuma ainda. Delegado a `lgpd-auditor`.
- **Evidências/comandos:** leitura de entidades e services.
- **Riscos residuais:** parte de programa LGPD maior.
- **Próximo passo:** desenhar fluxo de erasure.
- **Relacionado:** PROB-0032, BACKLOG-0007

### PROB-0032 — Sem trilha de auditoria de acesso/alteração de PII (LGPD Art. 37)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** LGPD
- **Sintoma:** grep por audit/log de acesso não encontrou nada. Nenhum registro de quem leu ou alterou PII. Só `console.error` ad-hoc em tenant mismatch.
- **Causa raiz:** confirmada.
- **Impacto técnico:** gap de accountability (Art. 37).
- **Arquivos/módulos:** projeto todo; `auto-provision.guard.ts:55`, `:72`
- **Solução proposta:** trilha de auditoria de acesso/modificação de PII.
- **Solução aplicada:** nenhuma ainda. Delegado a `lgpd-auditor`.
- **Evidências/comandos:** grep sem resultados de auditoria.
- **Riscos residuais:** parte de programa LGPD.
- **Próximo passo:** definir modelo de audit log.
- **Relacionado:** PROB-0031, BACKLOG-0007

### PROB-0033 — Drift de índices em `comissoes` (migration ⊂ entidade)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** ABERTO
- **Área:** banco
- **Sintoma:** migration só cria `tenant_uuid`, `tenant_updated` e o índice quebrado de `pedido`. A entidade declara índices adicionais (`tenant_id,deleted_at`; `tenant_id,data_pedido`; `tenant_id,status`; `tenant_id,fornecedor_id`) omitidos na migration.
- **Causa raiz:** confirmada — drift dev↔prod.
- **Impacto técnico:** prod sem índices de soft-delete e de relatório.
- **Arquivos/módulos:** `001:118-121`; `commission.entity.ts:11-16`
- **Solução proposta:** sincronizar migration com o conjunto de índices da entidade.
- **Solução aplicada:** nenhuma ainda. Delegado a `database-engineer`.
- **Evidências/comandos:** cruzamento migration × entidade.
- **Riscos residuais:** nenhum além de performance.
- **Próximo passo:** junto de PROB-0004.
- **Relacionado:** PROB-0004, PROB-0006

### PROB-0034 — Dois modelos de permissão coexistem (`role_permissions` vs `tenant_role_permissions`)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** ABERTO
- **Área:** banco
- **Sintoma:** modelo por role-string (`role_permissions`, migration 002) e modelo tenant-escopado (`tenant_role_permissions`, 003) coexistem; ambos referenciam `permissions.slug`. Provável legado vs atual — não reconciliado, possível schema morto (suposição).
- **Causa raiz:** suposição — evolução de modelo não limpa.
- **Impacto técnico:** confusão de modelagem; risco de decisão de permissão inconsistente.
- **Arquivos/módulos:** migrations `002`, `003`; entidades RBAC
- **Solução proposta:** decidir modelo único e remover o morto.
- **Solução aplicada:** nenhuma ainda. Delegado a `database-engineer` + `software-architect`.
- **Evidências/comandos:** inventário de migrations/entidades.
- **Riscos residuais:** interage com PROB-0012.
- **Próximo passo:** decisão arquitetural.
- **Relacionado:** PROB-0012

### PROB-0035 — Código morto/duplicado de auth no frontend
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** ABERTO
- **Área:** frontend
- **Sintoma:** (a) Zustand `authStore.ts` nunca importado (segunda fonte de verdade divergente); `main.tsx:12-15` ainda limpa a chave legada `auth-storage`. (b) Bloco de 401 em `apiClient.ts:86-90` inalcançável (checa rota `/login` inexistente; `authFetch` já redireciona/lança em 401 antes). (c) `AUTH_URL` com fallback hardcoded `https://auth.zonadev.tech` (`AuthContext.tsx:12`).
- **Causa raiz:** confirmada — superfície de auth substituída por `AuthContext`+`useAuth` sem limpeza.
- **Impacto técnico:** dois caminhos de redirect 401 concorrentes; fonte de verdade divergente; risco de drift.
- **Arquivos/módulos:** `frontend/src/store/authStore.ts`; `main.tsx:12-15`; `lib/apiClient.ts:86-90`; `context/AuthContext.tsx:12`
- **Solução proposta:** remover store/shim/bloco morto; env-driven no host de auth.
- **Solução aplicada:** nenhuma ainda. Delegado a `frontend-engineer`.
- **Evidências/comandos:** leitura + verificação de imports (store não importado).
- **Riscos residuais:** nenhum.
- **Próximo passo:** limpeza de código morto.
- **Relacionado:** PROB-0027, PROB-0029

### PROB-0036 — Robustez menor (frontend + backend): itens LOW agrupados
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** ABERTO
- **Área:** frontend / backend / segurança
- **Sintoma / itens:**
  - Frontend sem rota catch-all `path='*'` (tela em branco em rota desconhecida) e sem spinner durante `loading` do `ProtectedRoute` (`App.tsx:26-130`, `ProtectedRoute.tsx:17`).
  - `jwt.verify` sem pinar `algorithms:['HS256']` (`backend/src/auth/mobile-session.service.ts:100`).
  - `JwtAuthGuard` engole falha RS256 com `catch {}` e cai no path HS256 — mascara motivo real (`jwt-auth.guard.ts:36-52`).
  - Open-redirect via `return_to` OIDC sem allowlist (`oidc.controller.ts:18-35`, `:95-98`).
  - CORS com fallback `http://localhost:5173` + `credentials:true` quando `CORS_ORIGIN` ausente (`main.ts:31-34`).
  - Sessão mobile ignora mudança de `plan` por 30 dias (revalida só `token_version`/expiry) (`mobile-session.service.ts:96-137`).
  - Backoff de retry mobile: comentário diz 1s/2s/4s, real 1s/2s (`SyncService.ts:120-123`).
  - Mapeamento de resultado de push por índice `items[i]↔results[i]` (frágil a reorder) (`SyncService.ts:103-105`).
  - Precisão decimal inconsistente entre colunas de dinheiro (`order` `decimal(10,2)` vs `commission`/`parceiro` `decimal(12,2)`).
  - `Order.vendedor_id` sem relação/FK (`order.entity.ts:35-36`).
  - `timezone:'UTC'` em TypeOrmOptions é opção mysql-only, ignorada no Postgres (`app.module.ts:50`).
- **Causa raiz:** confirmada por leitura em cada caso (exceto onde marcado suposição).
- **Impacto técnico:** individualmente baixo; hardening/robustez/consistência.
- **Solução proposta:** tratar por área junto das correções maiores.
- **Solução aplicada:** nenhuma ainda. Delegado aos engenheiros de domínio correspondentes.
- **Evidências/comandos:** leituras nos arquivos citados.
- **Riscos residuais:** acúmulo de débito técnico se ignorado.
- **Próximo passo:** endereçar em varredura de robustez.
- **Relacionado:** BACKLOG-0008

---

## Revisão do prompt de migração Auth Nativa — 2026-07-08

Origem: análise do usuário (`docs/PossiveisErros.md`) sobre `Prompt_Auth_Nativa_Hardening_v1.md`, cruzada com o código atual. Relatório: [REVIEW_REPORTS/2026-07-08_security_review_auth-migration-prompt.md](REVIEW_REPORTS/2026-07-08_security_review_auth-migration-prompt.md). Só os apontamentos que **batem com o código atual** viram PROB; os pós-migração vão para BACKLOG-0009. Nenhum código alterado.

### PROB-0037 — Colunas de data em `TIMESTAMP WITHOUT TIME ZONE` corrompem o LWW
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** banco
- **Sintoma:** `@CreateDateColumn`/`@UpdateDateColumn`/`@DeleteDateColumn` na entidade base geram, no Postgres, colunas `timestamp without time zone`. O trigger `set_updated_at` grava `now()` (que é `timestamptz`); o offset é descartado no armazenamento. Comparações de conflito passam a depender do fuso do container.
- **Causa raiz:** confirmada — tipo default do TypeORM para `@*DateColumn` no Postgres é `timestamp` sem tz; `timezone:'UTC'` no `TypeOrmModule` é opção mysql-only e é ignorada no Postgres (ver PROB-0036).
- **Impacto técnico:** toda a estratégia de sync é "último `updated_at` vence" comparando timestamps entre mobile (offline, fuso local) e servidor. Sem tz, o LWW corrompe silenciosamente sob qualquer skew de fuso.
- **Arquivos/módulos:** `backend/src/common/entities/base.entity.ts:31-38`; `backend/src/database/migrations/001_initial_schema.sql:9-15`; `app.module.ts:50`
- **Solução proposta:** padronizar `TIMESTAMPTZ` em todas as colunas de data (`{ type: 'timestamptz' }` nas colunas da base + demais datas do financeiro); forçar `TimeZone=UTC` na conexão; entrar na migration baseline.
- **Solução aplicada:** nenhuma ainda. Delegado a `database-engineer` + `backend-engineer`.
- **Evidências/comandos:** leitura de `base.entity.ts` (sem `type` explícito) + trigger da migration.
- **Riscos residuais:** migração de tipo em coluna existente exige `USING ... AT TIME ZONE` correto para não deslocar dados já gravados.
- **Próximo passo:** definir conversão na migration baseline junto de BACKLOG-0004.
- **Relacionado:** PROB-0022, PROB-0036, BACKLOG-0004, BACKLOG-0009

### PROB-0038 — Backend sem `trust proxy` atrás do Nginx Proxy Manager
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** segurança / infra
- **Sintoma:** `main.ts` não configura `app.set('trust proxy', 1)`. Atrás do NPM (que termina o TLS), `req.secure` fica `false`, `req.ip` e `X-Forwarded-For` refletem o proxy, e `X-Forwarded-Proto` é ignorado.
- **Causa raiz:** confirmada — ausência de configuração de confiança no proxy.
- **Impacto técnico:** hoje parcial (throttle é por `user.sub`, não por IP — PROB-0036). Após a auth nativa vira pleno: cookie `Secure`/redirect por `req.secure` erra, lockout e rate-limit por IP enxergam o IP do proxy para todos os usuários, e a auditoria `ip INET` de `refresh_tokens` registra o IP do proxy.
- **Arquivos/módulos:** `backend/src/main.ts:8-9` (bootstrap, sem `trust proxy`)
- **Solução proposta:** `app.set('trust proxy', 1)` no Express subjacente do Nest; garantir que o NPM encaminha `X-Forwarded-For`/`X-Forwarded-Proto`.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura de `main.ts` (sem `set('trust proxy')`).
- **Riscos residuais:** confiar no proxy sem garantir que só o proxy alcança a app permite spoof de `X-Forwarded-For` — restringir a rede.
- **Próximo passo:** aplicar junto da Fase 0/1 da migração.
- **Relacionado:** PROB-0036, BACKLOG-0009

### PROB-0039 — Dupla fonte de verdade para `updated_at` (trigger DB + `@UpdateDateColumn`)
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** banco / backend
- **Sintoma:** `@UpdateDateColumn` faz o TypeORM escrever `updated_at` pelo relógio da aplicação; o trigger `set_updated_at` sobrescreve com o relógio do banco em todo UPDATE. Ora um, ora outro é autoritativo dependendo do caminho de escrita (ORM vs. SQL cru do sync).
- **Causa raiz:** confirmada — dois mecanismos de timestamp ativos simultaneamente.
- **Impacto técnico:** qualquer skew entre relógio do app e do banco corrompe o LWW do sync (que compara `updated_at`). UPDATE via ORM tem o valor do app potencialmente sobrescrito pelo trigger — comportamento não-determinístico entre caminhos.
- **Arquivos/módulos:** `backend/src/common/entities/base.entity.ts:34-35`; `backend/src/database/migrations/001_initial_schema.sql:9-50`
- **Solução proposta:** escolher fonte única — o trigger do banco (relógio único, autoritativo). Configurar a coluna como `{ update: false }` (ou não usar `@UpdateDateColumn`) para o TypeORM não escrever `updated_at`. Documentar a decisão.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura de `base.entity.ts` + triggers da migration.
- **Riscos residuais:** garantir que o SQL cru do sync também não seta `updated_at` manualmente (deixar o trigger cuidar).
- **Próximo passo:** decidir fonte única junto de PROB-0037.
- **Relacionado:** PROB-0022, PROB-0037, BACKLOG-0009

### PROB-0040 — Sem optimistic locking (`@VersionColumn`) → edição interativa concorrente perde dado
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** backend / frontend / banco
- **Sintoma:** nenhuma entidade usa `@VersionColumn`. Dois usuários editando o mesmo pedido/lançamento no web ao mesmo tempo: o último a salvar sobrescreve o trabalho do outro sem aviso (LWW aplicado à edição interativa, não só ao sync offline).
- **Causa raiz:** confirmada — `grep VersionColumn|@Version|optimistic backend/src` retorna 0.
- **Impacto técnico:** perda silenciosa de edição concorrente em pedidos, itens e financeiro (dados comerciais/financeiros).
- **Arquivos/módulos:** `common/entities/versioned-base.entity.ts`, `common/persistence/optimistic-concurrency.ts`, `common/errors/concurrent-modification.exception.ts`, `orders/*`, `finance/*`, `common/filters/global-exception.filter.ts`, `frontend/src/services/orders.service.ts`, `frontend/src/pages/Financeiro.tsx`, migration `0007_optimistic_concurrency.sql`.
- **Solução proposta:** `@VersionColumn` nas entidades de edição interativa; retornar 409 quando a versão divergir, avisando "registro alterado por outro usuário". Convive com o LWW do sync (que continua para o mobile).
- **Solução aplicada:** entidades web editáveis (`Order`, `FinanceMovement`, `Commission`, `Parceiro`, `Inadimplencia`) usam `VersionedBaseEntity` com `@VersionColumn`. Migration `0007_optimistic_concurrency.sql` adiciona `version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)` às cinco tabelas. PATCH/DELETE exigem versão lida pelo cliente e executam update atômico por `uuid + tenant_id + version + deleted_at IS NULL`; sucesso incrementa `version` e `updated_at` no mesmo SQL. Zero linhas afetadas gera `404` quando registro não existe no tenant ou `409 CONCURRENT_MODIFICATION` quando versão diverge. Filtro global preserva `resource`, `resourceId`, `expectedVersion` e `currentVersion`. Frontend envia versão, recarrega lista e mostra conflito inline.
- **Evidências/comandos:** builds backend/frontend PASS; Jest `11 suites / 22 tests` PASS, incluindo sucesso, conflito, 404 tenant-safe, soft delete e contrato do filtro global.
- **Riscos residuais:** mobile/sync offline excluído deste escopo por decisão do produto. `OrderItem` não possui endpoint de edição web independente; versão do pedido protege operações web existentes.
- **Operação/deploy:** executar runner de migrations antes de subir nova API; backend novo não deve atender tráfego antes da aplicação de `0007`. Migration usa nome de quatro dígitos exigido por `MIGRATION_FILE`.
- **Próximo passo:** aplicar migration `0007` antes do deploy e validar coluna `version` nas cinco tabelas.
- **Relacionado:** PROB-0022, BACKLOG-0009, BUG-0007

### PROB-0041 — DTOs sem validador de CNPJ/CEP (só `@IsString`)
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** LOW
- **Status:** ABERTO
- **Área:** backend
- **Sintoma:** `cnpj` e `cep` no DTO de cliente são apenas `@IsOptional() @IsString()` — sem checagem de dígito verificador (CNPJ) nem de formato (CEP). CNPJ inválido entra no cadastro e contamina cliente, pedido e o financeiro depois.
- **Causa raiz:** confirmada — leitura do DTO.
- **Impacto técnico:** dados inválidos persistidos; relatórios e integrações fiscais futuras herdam o lixo.
- **Arquivos/módulos:** `backend/src/clients/dto/create-client.dto.ts:17`, `:24` (e DTOs equivalentes de transportadora/fornecedor)
- **Solução proposta:** custom validators de CNPJ (dígito verificador) e CEP nos DTOs de cliente/transportadora/fornecedor.
- **Solução aplicada:** nenhuma ainda. Delegado a `backend-engineer`.
- **Evidências/comandos:** leitura de `create-client.dto.ts`.
- **Riscos residuais:** dados legados já gravados continuam inválidos — validar só na entrada não limpa o passado.
- **Próximo passo:** implementar validators na Fase 1.
- **Relacionado:** BACKLOG-0009
