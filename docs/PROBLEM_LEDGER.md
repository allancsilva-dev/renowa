# PROBLEM_LEDGER — Renowa

Registro central de problemas. Mantido pelo `docs-reporter`. IDs sequenciais (`PROB-NNNN`), sem colisão. Referência cruzada com [BUGFIX_LOG.md](BUGFIX_LOG.md) e [BACKLOG.md](BACKLOG.md) por ID.

**Não registrar suposição como fato.** O que não foi verificado é marcado como suposição.

## Estado atual — revisão 2026-07-22 (parte 3: revisão independente + testes + Wave 0/Wave 1 do commit `d91b9b3`)

**Enquadramento: o produto vai para produção depois desta rodada.** Isso eleva a severidade de todo achado que hoje é "só dev" mas **não foi verificado em produção** — nenhuma verificação contra o banco de produção foi feita nesta sessão.

> **CORREÇÃO DE FATO (segundo passe de registro, verificada por `git log`/`git show --stat`):** o parágrafo abaixo, escrito no primeiro passe, **está desatualizado**. Tudo o que esta sessão produziu **foi commitado** como **`f85809f`** — _"fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes"_, 2026-07-22 15:56, 22 arquivos (código + docs do primeiro passe), incluindo `0031_restore_schema_invariants.sql`, `verify-schema.ts` e o bloco `overrides` do `package.json` da raiz. As entradas de BUGFIX_LOG desta sessão (BUG-0019 a BUG-0027) foram atualizadas de `pendente` para `f85809f`. **Este agente não fez nenhum commit** — apenas registrou o estado real. O parágrafo original fica preservado abaixo como snapshot histórico do primeiro passe.

**Estado de commit: NADA foi commitado nesta sessão. Tudo está no working tree** (confirmado por `git status --porcelain` no momento deste registro: `backend/package.json`, `backend/src/app.module.ts`, `backend/src/faturamento/faturamento.service.ts`, `backend/src/orders/dto/create-order.dto.ts`, `backend/src/orders/orders.service.ts`, `backend/src/orders/orders.service.spec.ts`, `frontend/src/pages/PedidoForm.tsx`, `package.json`/`package-lock.json` na raiz modificados; `backend/src/database/migrations/0031_restore_schema_invariants.sql` e `backend/src/database/verify-schema.ts` não rastreados).

- **Suíte de testes (execução real nesta sessão):** baseline do commit `d91b9b3` confirmado — shared 8/8 (1 suite), backend **236/236** (38 suites), frontend 29/29 (8 arquivos); lint e build limpos nos três workspaces. Após as correções desta sessão, `orders`+`faturamento` foram de 26 → **29 testes** (total esperado do backend: 239, sujeito a subir com o trabalho em andamento).
- **Ressalva estrutural sobre a suíte (levantada pelo `quality-reviewer`, não neutralizada):** toda a suíte de `faturamento`/`finance`/`orders` é **mock puro** (`jest.fn()` sobre repositórios); nada roda contra Postgres. Os 236 verdes **não provam** que locks pessimistas, FKs compostas, índices únicos parciais e CHECKs funcionem. A asserção central "duas notas concorrentes no mesmo pedido serializam" é **inverificável** pelos testes atuais — ver BACKLOG-0028.
- **PROB-0059 (`synchronize`) teve reincidência confirmada por query direta no banco de dev e escopo real muito maior que o registrado**: não eram 4 objetos, eram **zero CHECK constraints em todo o schema `public`** (as migrations declaram ~20), mais 2 índices únicos parciais e todos os triggers `set_updated_at`. Mecanismo desligado, invariantes restauradas pela migration `0031`, detector de drift criado (`db:verify`). Agora **FECHADO_COM_RESSALVA** — a ressalva é que **produção não foi verificada**.
- **PROB-0060 teve o diagnóstico corrigido**: a função `public.set_updated_at()` **existe** (recriada por `CREATE OR REPLACE` na migration `0028`); faltavam só os triggers. Restaurados em dev pela `0031`. Produção não verificada.
- **Achado novo de alta severidade: a infra de sync das migrations `0008`/`0009` não existe no banco de dev**, apesar de ambas constarem como aplicadas em `schema_migrations` — **PROB-0061**. Consequência transversal: **`schema_migrations` não é evidência confiável do que existe no banco, em nenhum ambiente.**
- **Dois bloqueadores da máquina de estados de pedido, achados e corrigidos nesta sessão:** PROB-0062 (`status` gravável via POST/PUT contornando a permissão `pedidos.liberar` criada por este mesmo commit) e PROB-0063 (`DELETE /pedidos/:uuid` sem checagem de faturamento, deixando nota/comissão órfãs e impossíveis de corrigir). Ver BUG-0022 e BUG-0023.
- **Cinco achados novos ABERTOS, não corrigidos nesta sessão:** PROB-0064 (mass assignment em `PATCH /produtos` e `PATCH /transportadoras` — **única falha identificada com quebra real de isolamento multi-tenant**, pré-existente), PROB-0065 (caminho de sync ignora a máquina de estados nova), PROB-0066 (`PATCH /financeiro/comissoes/:uuid` legado contorna a máquina de estados), PROB-0067 (PII completa de cliente exposta a quem só tem `faturamento.ver` — relevante LGPD), PROB-0068 (**NestJS 10.4.22 é fim de linha** — gate de produção).
- **~~Três frentes EM_ANDAMENTO~~ → as três FECHARAM ainda nesta sessão (segundo passe, 2026-07-22):** PROB-0069 (`xlsx@0.18.5` → `papaparse`, importação passa a ser **só CSV**, limite de linhas **durante** o parse, `@Throttle` 5/min, BOM/Windows-1252/`;`), PROB-0070 (`parseImportPrice` corrigindo o bug pré-existente que rejeitava **todo preço acima de mil** exportado do Excel pt-BR) e PROB-0071 (`overrides` de `multer`/`express`/`body-parser` na raiz + bump e **dedup** de `typeorm`). Ver BUG-0024, BUG-0025, BUG-0026 e BUG-0027.
- **Números finais da sessão (execução real):** shared **8/8** (1 suite); backend lint **limpo**, build **ok**, **260/260** (38 suites) — baseline do commit era 236, **+24**; frontend lint **limpo**, build **ok**, **29/29** (8 arquivos).
- **Gate de dependências desta rodada: FECHADO.** `npm audit --omit=dev --workspace=backend` foi de **20 → 13** (critical 0, high 6, moderate 7), e os 13 restantes são **exatamente** os já triados como não-aplicáveis mais o bloco que só sai com NestJS 11. **Nenhuma vulnerabilidade alcançável permanece aberta.** Detalhe em PROB-0068; **BACKLOG-0040 é o único caminho para os 13 restantes.**
- Relatório completo da sessão: [REVIEW_REPORTS/2026-07-22_fullstack_review_fluxo-comercial-completo-wave0-wave1.md](REVIEW_REPORTS/2026-07-22_fullstack_review_fluxo-comercial-completo-wave0-wave1.md). Itens novos de backlog: BACKLOG-0024 a BACKLOG-0046.

## Estado atual — revisão 2026-07-22 (parte 2, pós "Fluxo Comercial Completo")

- **Implementação de grande porte concluída: "Fluxo Comercial Completo" (pedidos → faturamento → comissão → caixa)**, plano em `/Users/Zero/.claude/plans/fluxo-comercial-completo-buzzing-seal.md`. Catálogo de permissões (`shared/src/permissions/catalog.ts`) ganhou módulo `FATURAMENTO` e 3 slugs novos (`pedidos.liberar`, `faturamento.ver`, `faturamento.editar`), catálogo de 25→28 entradas; migrations `0026`–`0030` aplicadas em dev (novos campos de endereço em clientes/fornecedores, ciclo de vida de status de pedido, tabela `notas_fiscais`, vínculo `comissoes`↔pedido/nota, permissões novas concedidas a `admin`/`gestao`/`financeiro`); backend com novos módulos `consultas` (CNPJ via BrasilAPI) e `faturamento`, `OrdersService.liberar()`, bloqueio de edição pós-liberação; frontend com `AsyncCombobox`, `FornecedorForm`, tela "Faturamento", "Consultar CNPJ". Relatório completo: [REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md](REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md). Dois achados de risco estrutural (não corrigidos, fora do escopo desta feature) registrados como **PROB-0059** (`synchronize:true` em dev coexistindo com migrations SQL — já causou drop silencioso de 4 invariantes recém-criadas) e **PROB-0060** (drift pré-existente: triggers `set_updated_at` da migration `0020` ausentes no Postgres de dev). Quatro achados de crítica de design pós-implementação (score 23/40, `.impeccable/critique/2026-07-22T17-30-23Z__edidodetalhe-financeiro-fornecedores-asynccombobox.md`) adiados por decisão do usuário registrados em BACKLOG-0021 a BACKLOG-0023. **Confirmado por `git status` no momento deste registro: toda a implementação (backend/frontend do Fluxo Comercial Completo) está no working tree, sem nenhum commit** — migrations `0026`–`0030` já aplicadas no Postgres de dev, mas o código correspondente ainda não foi commitado em `master`.

## Estado atual — revisão 2026-07-22

- **Overhaul de RBAC em 6 etapas (commits `e24a1cf`→`5553779` em `master`, mais Etapa 6 no working tree ao final desta sessão): elimina o bypass hardcoded `role.name === 'admin'` e conclui a reconciliação que PROB-0043 havia deixado fora de escopo (`AuditController`/`PrivacyController`).** Registrado como PROB-0058 (FECHADO_COM_RESSALVA — ressalvas: sem smoke visual em navegador nesta rodada, Etapa 6 ainda não commitada no momento do registro). Verificado por leitura direta do código atual (não só pelo resumo do implementador): `permission.guard.ts`/`sync-authorization.service.ts`/`auth.controller.ts` sem bypass de admin (só `SUPERADMIN` resta); `roles.guard.ts`/`roles.decorator.ts` confirmados removidos do repo; `audit.controller.ts`/`privacy.controller.ts` usando `@RequirePermission`; `roles.service.ts` com `AuditService` injetado e proteções `is_system`. `SYSTEM_OVERVIEW.md` corrigido em 3 pontos que estavam desatualizados (catálogo `role_permissions` já dropado, PROB-0034 já FECHADO, sync já tem RBAC). Novo item de backlog de baixa prioridade registrado (BACKLOG-0020 — rename de perfil sem UI, pré-existente).

## Estado atual — revisão 2026-07-21

- **Smoke test de regressão do Dashboard após a sequência de commits `fbadfee`→`349a961` (fluxo de validação de pedido, totais transacionais centralizados, cookies em HTTP local, response wrapping, RBAC, validação de queries do Financeiro, nomes em vez de IDs técnicos, métricas operacionais reais), nunca reexecutado depois dessas mudanças.** Teste manual real pelo frontend (Safari via osascript: login com setters compatíveis com React, `fetch('/api/financeiro/dashboard', {credentials:'include'})` no contexto da página, `window.onerror`, `screencapture`). Resultado: login OK, `GET /api/financeiro/dashboard` → `200`, zero erro JS no console, nenhum `[role=alert]` na tela, widgets renderizados com dado real do seed. **Nenhuma das mudanças recentes (RBAC, orders, auth cookie, response wrapping) quebrou o dashboard**, confirmado também por leitura de código (`fbadfee`/`8b0ad97` não tocam `finance.service.ts`; RBAC de `664e951` faz bypass total para `role.name === 'admin'`; o wrapping de `c942606` é compatível com o formato que `getDashboard()` já retornava). Encontrado 1 bug real pré-existente (não causado por esses commits): PROB-0056 — KPI "Faturamento" do card "Resumo" sempre `R$ 0` enquanto "Evolução de Venda" e "Curva ABC de Clientes" mostravam a mesma venda real na mesma tela (duas fontes de verdade divergentes para "venda"). Corrigido nesta sessão — ver BUG-0016. Fix no working tree, **sem commit**; suíte automatizada e typecheck **não foram executados** por este agente (ambiente sem `node`/`npm`).
- **Reescrita do Dashboard (`frontend/src/pages/Dashboard.tsx` + `FinanceService.getDashboard`), até então quase todo mock hardcoded zerado (só 4 das métricas financeiras vinham de dado real da API).** Achado consolidado em PROB-0055 (causa raiz: dashboard inteiro era mock, não perceptível a partir de uma leitura superficial do frontend sem comparar contra a origem real dos dados no backend). Mock removido; widgets ligados a dado real via SQL cru no `FinanceService` (mesmo padrão de `DataSource` já usado no arquivo); card "Desempenho Mensal" removido por depender de um conceito de "Meta" inexistente em qualquer lugar do sistema (não implementado, não inventado). Smoke test manual real pelo frontend (Safari via osascript, mesmo tenant/usuário de testes anteriores) encontrou e corrigiu 3 bugs de dado real, todos em `FinanceService.getDashboard` (backend) e um no `Dashboard.tsx` (frontend) — ver PROB-0055 e BUGFIX_LOG BUG-0013/0014/0015. Todos os fixes estão no working tree, **sem commit**. Backend typecheck limpo, suíte completa reportada pelo usuário como 32 suites / 183 testes sem regressão (não reexecutada por este agente), frontend typecheck limpo.
- **Continuação do teste manual real pelo frontend (Safari, via osascript), mesma sessão de hoje, cobrindo o que faltava: Produtos, Fornecedores (reconfirmado), Clientes, Pedido completo (criação+detalhe+troca de status) e as 6 abas do Financeiro.** Encontrados e corrigidos 2 bugs novos: PROB-0053 (`ValidationPipe forbidNonWhitelisted` quebrava com 400 as abas Comissão/Parceiros/Custos do Financeiro por mistura de `@Query() DTO` com `@Query('x')` individuais) e PROB-0054 (data do pedido exibida com 1 dia a menos em `Pedidos.tsx`/`PedidoDetalhe.tsx` por shift de timezone, mesma classe de bug já corrigida antes só no Financeiro). Ambos os fixes estão no working tree, **sem commit** (ver BUGFIX_LOG BUG-0011/0012). Um achado menor de UX (formulário "Nova Comissão" não reseta ao reabrir) não foi corrigido — ver BACKLOG-0015. Regressões reconfirmadas sem bug novo: login (PROB-0049), CRUD de Fornecedor, Pedido com itens e troca de status (PROB-0051).
- **Teste manual real pelo frontend (Safari, via osascript) validando o hotfix de segurança/telas desta mesma data (PROB-0042 a PROB-0046), até então só verificado por build/lint/testes automatizados.** PROB-0042/0043/0044 tiveram o comportamento corrigido confirmado clicando de verdade no navegador (não só specs com mocks); PROB-0045/0046 tiveram o clique-through real que faltava (ver BACKLOG-0011, agora FECHADO_COM_RESSALVA). Nesse teste manual foram encontrados e corrigidos 3 bugs novos, fora do escopo do hotfix, que só um teste em navegador de verdade revela: PROB-0049 (cookies `Secure` fixos quebravam login no Safari em dev local), PROB-0050 (`ResponseInterceptor` não envolvia resposta de entidades com uma coluna de domínio chamada `data`, ex. `Pedido`) e PROB-0051 (`PATCH /pedidos/:uuid/status` devolvia o pedido sem a relação `itens`, quebrando a tela). Os 3 fixes estão no working tree, **sem commit** (ver BUGFIX_LOG BUG-0008/0009/0010). Também documentada uma lacuna real de onboarding de ambiente dev (catálogo de `permissions` vazio por padrão) — ver BACKLOG-0012.
- **Nova auditoria (3 subagentes: segurança, banco, campos quebrados) cruzada contra `/docs/renowa` e a documentação viva.** 2 achados foram descartados por checagem cruzada (ver nota abaixo); 6 novos problemas reais foram abertos e corrigidos nesta rodada: PROB-0042 a PROB-0046 (backend/frontend, FECHADO ou FECHADO_COM_RESSALVA) e PROB-0048 (mobile, ABERTO/bloqueado por restrição de `AGENTS.md`). PROB-0047 (LOW) foi aberto e fechado como NÃO_REPRODUZIDO — o comentário apontado como desatualizado já está correto no código atual.
- **Migration runner ignora arquivos de 3 dígitos:** achado reavaliado nesta rodada contra a ledger — já coberto integralmente por PROB-0004/0005/0006/0033 (todos FECHADO) e BACKLOG-0004 (FECHADO). Nenhuma entrada nova necessária.
- **Estado herdado da revisão 2026-07-12** (não reverificado nesta rodada, exceto onde indicado): 9 problemas ligados ao mobile/sync offline permanecem ABERTO (PROB-0008, PROB-0009, PROB-0010, PROB-0020, PROB-0021, PROB-0022, PROB-0023, PROB-0024, PROB-0030); PROB-0036 permanece PARCIALMENTE_RESOLVIDO pelo saldo mobile.
- Relatórios em `REVIEW_REPORTS/`, planos e prompts são snapshots históricos; lista operacional vigente é esta ledger.

## Formato de entrada

```
### PROB-NNNN — <título claro>
- **Data:** YYYY-MM-DD
- **Origem:** revisão | auditoria | bug report | teste | implementação | usuário
- **Severidade:** BLOCKER | HIGH | MEDIUM | LOW
- **Status:** ABERTO | EM_ANDAMENTO | PARCIALMENTE_RESOLVIDO | FECHADO | FECHADO_COM_RESSALVA | NÃO_REPRODUZIDO
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
- **Status:** FECHADO
- **Verificado em:** 2026-07-12 (commit `85f7867`)
- **Área:** segurança
- **Sintoma:** `backend/env_renowa.txt` está rastreado no git (`git ls-files` confirma) contendo `DATABASE_URL` (host/porta/usuário/senha do Postgres de produção), `RENOWA_JWT_SECRET` (chave HS256 real de 256 bits) e `AUTH_INTERNAL_SECRET`.
- **Causa raiz:** confirmada — `.gitignore` cobre apenas `.env*` (linhas 13-17); o nome `env_renowa.txt` não casa com o padrão.
- **Impacto técnico:** takeover total do DB; qualquer um com acesso ao repo forja JWT mobile de 30 dias para **qualquer tenant/roles** — colapsa toda a fronteira multi-tenant.
- **Arquivos/módulos:** `backend/env_renowa.txt`, `.gitignore:13`
- **Solução proposta:** `git rm --cached backend/env_renowa.txt`, adicionar ao `.gitignore`, **rotacionar todos os segredos** (senha DB, RENOWA_JWT_SECRET, AUTH_INTERNAL_SECRET) e purgar histórico do git.
- **Solução aplicada:** arquivo removido do índice e `.gitignore` estendido — agora cobre `env_*.txt` (linha 24) e `backend/env_renowa.txt` (linha 25). `git ls-files | grep env_renowa` → vazio (não rastreado). Aplicado no commit `85f7867`.
- **Evidências/comandos:** `git ls-files | grep -i env_renowa` → sem saída; `grep -n env .gitignore` → linhas 24-25 cobrem o padrão.
- **Riscos residuais:** rotação de segredos e purge do histórico não foram verificados; risco aceito por decisão explícita do usuário em 2026-07-12.
- **Próximo passo:** nenhum; problema encerrado por decisão do usuário.
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
- **Status:** FECHADO
- **Área:** backend / segurança
- **Sintoma:** originalmente, push e pull de sync não declaravam autorização. Uma mitigação parcial posterior protegeu pull, mas exigia todas as permissões `.editar` no push inteiro, sem distinguir entidade ou operação.
- **Causa raiz:** endpoint de push é polimórfico; autorização estática por controller não inspecionava `entity` e `operation` de cada item.
- **Impacto técnico:** antes da correção, usuário autenticado podia contornar RBAC; na mitigação parcial, usuários legítimos eram bloqueados e `CREATE`/`DELETE` não exigiam seus slugs exatos.
- **Arquivos/módulos:** `sync.controller.ts`; `sync-authorization.service.ts`; `sync-entity-policy.ts`; testes dedicados de controller, política e autorização.
- **Solução proposta:** aplicar checagem de permissão por entidade/operação no caminho de sync.
- **Solução aplicada:** política central define `pull/create/update/delete` para cada entidade. Push v1/v2 carrega permissões uma vez, valida lote inteiro antes de qualquer escrita e rejeita tudo com `403` se faltar um slug. `itens_pedido` herda permissões de `pedidos`. `SUPERADMIN` e papel tenant `admin` mantêm bypass; contexto ausente, inativo ou cross-tenant é negado. Pull v1/v2 permanece protegido por `.ver`, com teste de invariância contra a política. Negação gera log estruturado sem payload/PII de domínio.
- **Evidências/comandos:** `npm test --workspace=backend -- sync --runInBand --silent` — 68/68. Cobertura inclui admin, manager, viewer, lote misto, operação exata, zero escrita após negação, contexto cross-tenant, filtros tenant-scoped no push/pull e todas as rotas pull v1/v2.
- **Riscos residuais:** autorização é tenant-scoped e queries mantêm `tenant_id`; teste contra PostgreSQL real continua dependente de ambiente integrado disponível.
- **Próximo passo:** monitorar eventos `sync_authorization_denied` e manter teste de invariantes ao adicionar entidade ou operação.
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
- **Status:** FECHADO_COM_RESSALVA
- **Verificado em:** 2026-07-12 (commit `be74446`)
- **Área:** banco / segurança
- **Sintoma:** todo `@ManyToOne` referencia apenas a coluna `id`; não há constraint composta `(tenant_id, <fk>_id)`. Uma linha do tenant A pode referenciar pai do tenant B — nada no DB impede.
- **Causa raiz:** confirmada — FKs não incluem `tenant_id`.
- **Impacto técnico:** vazamento cross-tenant na camada de integridade; ex.: `leftJoinAndSelect('c.fornecedor')` pode trazer `razao_social` de outro tenant.
- **Arquivos/módulos:** `order.entity.ts:31,41,48`; `client.entity.ts:61`; `product.entity.ts:13`; `inadimplencia.entity.ts:14`; `commission.entity.ts:22,29`; `parceiro.entity.ts:21,28`; `order-item.entity.ts:15,23`
- **Solução proposta:** FKs compostas `(tenant_id, cliente_id) REFERENCES clientes(tenant_id, id)` etc.; exige unique composto nos pais.
- **Solução aplicada:** migration incremental `0021_cross_tenant_foreign_keys.sql` audita e aborta diante de referências cross-tenant, recupera o escopo tenant de `tenant_role_permissions` ignorado pela migration antiga `007_*`, cria chaves/índices compostos, adiciona 16 FKs `(tenant_id, <fk>_id)` como `NOT VALID`, valida e só então remove FKs simples legadas. Entidades TypeORM usam `@JoinColumn` composto; `permissions` permanece catálogo global.
- **Evidências/comandos:** teste dedicado valida 16 relações, metadata TypeORM, cobertura da auditoria e ordem `NOT VALID`/`VALIDATE`; `npm test --workspace=backend -- cross-tenant-foreign-keys --runInBand` — 21/21; suíte backend completa — 116/116; `npm run build --workspace=backend` passou. Lint não executou porque `eslint` não está instalado no workspace. PostgreSQL local exige credencial não disponível e Docker está parado, então migration ainda não foi aplicada contra banco real.
- **Riscos residuais:** implementação e testes de contrato estão concluídos, mas índices são criados dentro da transação do runner e exigem janela operacional compatível com volume. Auditoria e constraints ainda precisam ser executadas em staging/produção; falta evidência do catálogo PostgreSQL e tentativa cross-tenant retornando `23503`.
- **Próximo passo:** problema de código fechado; rollout e validação operacional permanecem em BACKLOG-0006.
- **Relacionado:** PROB-0026, BACKLOG-0006

### PROB-0012 — Invariante "tenant_id em TODA tabela" violado em `tenant_role_permissions`
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Verificado em:** 2026-07-12 (commit `be74446`)
- **Área:** banco / segurança
- **Sintoma:** originalmente, `tenant_role_permissions` não carregava `tenant_id` e dependia do join transitivo `role_id → tenant_roles.tenant_id`. `permissions` e `role_permissions` permanecem catálogos globais intencionais.
- **Causa raiz:** confirmada — associação tenant-específica foi criada sem modelar seu escopo explicitamente; além disso, a migration antiga `007_*` não era executada pelo runner de migrations com prefixo de quatro dígitos.
- **Impacto técnico:** antes da correção, isolamento dependia sempre do join com `tenant_roles`; banco não expressava diretamente ownership da associação.
- **Arquivos/módulos:** `tenant-role-permission.entity.ts`; `permissions.service.ts`; `permission.guard.ts`; migrations `003_tenant_rbac_model.sql`, `007_tenant_role_permissions_tenant.sql` e `0021_cross_tenant_foreign_keys.sql`; `cross-tenant-foreign-keys.spec.ts`; `permissions.service.spec.ts`
- **Solução proposta:** adicionar `tenant_id NOT NULL`, unicidade `(tenant_id, role_id, permission_slug)`, FK composta `(tenant_id, role_id)`, metadata TypeORM composta e filtro explícito de tenant nas consultas de permissões.
- **Solução aplicada:** migration efetiva `0021_cross_tenant_foreign_keys.sql` recupera o modelo ignorado da `007_*`: adiciona e preenche `tenant_id`, exige `NOT NULL`, cria unicidade e índice tenant-escopados e FK composta para `tenant_roles(tenant_id, id)`. Entidade usa `@JoinColumn` composto. `PermissionsService.listEffectiveForRole` filtra `{ tenantId, roleId }`; `PermissionGuard` fornece ambos a partir do usuário autenticado.
- **Evidências/comandos:** teste dedicado cobre metadata TypeORM e migration composta; teste de `PermissionsService` confirma filtro por tenant. `npm test --workspace=backend -- cross-tenant-foreign-keys --runInBand` — 21/21; suíte backend completa — 116/116; `npm run build --workspace=backend` passou durante PROB-0011. Lint não executou naquela validação porque `eslint` não estava instalado no workspace.
- **Riscos residuais:** implementação e testes estão concluídos, mas migration ainda não foi aplicada contra PostgreSQL real; faltam evidência do catálogo, medição de locks e tentativa cross-tenant retornando `23503`. Coexistência do modelo global `role_permissions` segue separada em PROB-0034.
- **Próximo passo:** problema de código fechado; rollout e validação operacional permanecem em BACKLOG-0006.
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
- **Status:** FECHADO
- **Área:** frontend
- **Sintoma:** `isAdmin()`/`hasPermission()` comparam com literal `'ADMIN'` (maiúsculo). `ROLE_OPTIONS` usa `['admin','manager','viewer']` (minúsculo) e `useAuth.ts` compara case-insensitive — dois verificadores discordam.
- **Causa raiz:** confirmada (inconsistência interna); casing real do backend = suposição.
- **Impacto técnico:** se o JWT emite `'admin'`, `isAdmin()` retorna false e a rota `adminOnly` `/configuracoes` redireciona um admin real para `/`.
- **Arquivos/módulos:** `frontend/src/context/AuthContext.tsx:70,75`; `hooks/useAuth.ts:7`; `pages/UsuariosPage.tsx:30`; `App.tsx:103`
- **Solução proposta:** normalizar casing num único helper compartilhado (comparação lowercase).
- **Solução aplicada:** verificadores e normalização centralizados em `frontend/src/lib/authorization.ts`; `AuthContext` normaliza roles recebidas da API; hook reutiliza os mesmos helpers; store Zustand não utilizado e case-sensitive removido.
- **Evidências/comandos:** busca sem comparações diretas de role no frontend; `npm run build --workspace=frontend` passou. Lint indisponível porque o script referencia `eslint`, pacote ausente das dependências do workspace.
- **Riscos residuais:** duas entradas públicas de `useAuth` permanecem por compatibilidade (PROB-0027), mas ambas usam a mesma fonte de autorização.
- **Próximo passo:** tratar separadamente a API duplicada de hooks em PROB-0027.
- **Relacionado:** PROB-0027

### PROB-0015 — AuthCallback trata falha como sucesso
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** HIGH
- **Status:** FECHADO
- **Área:** frontend
- **Sintoma:** no fluxo OIDC legado, `await res.json()` era seguido de `setStatus('success')` sem checar `res.ok`. Falhas de callback (state mismatch, code expirado, 4xx/5xx) sem `redirect` caíam no fallback `window.location.href = '/dashboard'`, reportando sucesso sem sessão válida.
- **Causa raiz:** confirmada — status HTTP, formato do payload e estabelecimento da sessão não eram validados antes do redirect.
- **Impacto técnico:** usuário era enviado ao app sem cookie válido, causando novo 401 e loop de redirect.
- **Arquivos/módulos:** antigo `frontend/src/pages/AuthCallback.tsx`; `frontend/src/App.tsx`; fluxo atual em `frontend/src/pages/Login.tsx` e `frontend/src/context/AuthContext.tsx`.
- **Solução proposta:** validar `res.ok`, payload e sessão antes do redirect ou eliminar o callback ao substituir OIDC.
- **Solução aplicada:** autenticação nativa substituiu integralmente o fluxo OIDC no commit `418f91a` (`feat(auth): wire frontend native login`). `AuthCallback.tsx` e rota `/callback` foram removidos; frontend atual usa rota pública `/login`. Não foi mantido patch em código morto.
- **Evidências/comandos:** histórico do Git confirma remoção de `AuthCallback.tsx` e `/callback` no commit `418f91a`; busca em `backend/src` e `frontend/src` não encontrou referências a `OIDC`, `/auth/oidc/*`, `/callback` ou `AuthCallback`.
- **Riscos residuais:** configuração externa antiga de redirect OIDC, se ainda existir no provedor ou ambiente de deploy, deve ser removida para evitar tráfego para rota inexistente.
- **Próximo passo:** manter teste de regressão das rotas públicas e retirar eventual configuração OIDC residual do ambiente.
- **Relacionado:** —

### PROB-0016 — `TenantSubscriber` nunca registrado — defesa em profundidade inexistente
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Área:** backend / segurança
- **Sintoma:** `TenantSubscriber` não é registrado como provider nem instanciado por DI (grep confirma: só referências no próprio arquivo). O `cls.set('tenantId')` do interceptor não tem consumidor ativo — o único `cls.get` era esse subscriber.
- **Causa raiz:** confirmada — `grep -rn "TenantSubscriber" backend/src` retorna só `tenant.subscriber.ts:24` e `:39`.
- **Impacto técnico:** a proteção "injeta/valida tenant_id em todo INSERT" descrita na memória do projeto **não existe**. Isolamento depende 100% de cada service passar `tenantId` manualmente (hoje passam). Sync usa `INSERT` cru — nunca passaria por subscriber de qualquer forma. Interceptor+CLS são efetivamente código morto. **Corrige afirmação falsa em SYSTEM_OVERVIEW e DIAGRAMS.**
- **Arquivos/módulos:** `backend/src/common/subscribers/tenant.subscriber.ts`; `tenant-context.interceptor.ts:27-28`
- **Solução proposta:** registrar `TenantSubscriber` como provider de módulo, OU remover interceptor/subscriber mortos para não dar falsa sensação de proteção.
- **Solução aplicada:** subscriber, interceptor e dependência CLS mortos removidos. Tenant permanece explícito nos services/repositories; constraints tenant-scoped são defesa no banco.
- **Evidências/comandos:** `grep -rn "TenantSubscriber" backend/src` → 2 hits (mesmo arquivo).
- **Riscos residuais:** nota: o agente de segurança assumiu que o subscriber protegia — **assunção incorreta**, refutada por este grep.
- **Próximo passo:** decidir registrar vs remover.
- **Relacionado:** —

### PROB-0017 — `GlobalExceptionFilter` vaza `exception.message` cru em erros 500
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Área:** segurança
- **Sintoma:** para qualquer não-`HttpException` (500), o `exception.message` cru volta no body JSON, junto de `request.url`.
- **Causa raiz:** confirmada.
- **Impacto técnico:** vazamento de strings internas/de DB (info disclosure).
- **Arquivos/módulos:** `backend/src/common/filters/global-exception.filter.ts:53-55`, `:60-67`
- **Solução proposta:** mensagem genérica para 500; detalhes só no log do servidor.
- **Solução aplicada:** respostas de exceções inesperadas mantêm `INTERNAL_SERVER_ERROR` e mensagem genérica; mensagem e stack internas ficam restritas ao log do servidor. Respostas controladas de `HttpException` permanecem preservadas. Testes cobrem `Error`, valor não-`Error` e metadados de conflito otimista.
- **Evidências/comandos:** `npm test --workspace=backend -- global-exception.filter.spec.ts --runInBand` (3 testes); suíte backend completa (16 suítes, 83 testes); build backend aprovado.
- **Riscos residuais:** nenhum.
- **Próximo passo:** nenhum.
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
- **Solução aplicada:** backend push v2 agora classifica resultado terminal/repetível com código estável e `retryable`; dead-letter, limite e backoff continuam pendentes no mobile e não foram alterados.
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
- **Solução aplicada:** backend push v2 ganhou deduplicação durável por tenant/device/operação e concorrência otimista por registro. Mutex, ref guard e coalescing continuam pendentes no mobile e não foram alterados.
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
- **Solução aplicada:** backend push v2 exige `base_version` em UPDATE/DELETE, faz escrita condicional atômica e retorna `VERSION_CONFLICT`; `client_timestamp` não integra contrato v2. Migração do cliente mobile permanece pendente; v1 continua compatível.
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
- **Solução aplicada:** nenhuma. Mantido aberto porque instrução vigente exclui alterações e validações do workspace `mobile`.
- **Evidências/comandos:** leitura de `ApiService.ts`.
- **Riscos residuais:** precisa validação em runtime.
- **Próximo passo:** retomar somente após autorização explícita para trabalhar no workspace `mobile`; então validar no build Expo alvo antes de escolher decoder.
- **Relacionado:** —

### PROB-0025 — Rota `POST /api/auth/mobile-session` duplicada (placeholder que lança 500)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Área:** backend
- **Sintoma:** dois `@Controller('auth')` declaram `@Post('mobile-session')`. O handler de `AuthController` faz `throw new Error(...)` (HTTP 500). O primeiro registrado (`AuthControllerImpl`) vence por ordem do Express — o que lança fica morto mas load-bearing na ordem de registro.
- **Causa raiz:** confirmada — controller placeholder deixado registrado.
- **Impacto técnico:** frágil; reordenar o array `controllers` quebra o login com 500.
- **Arquivos/módulos:** `backend/src/auth/auth.service.ts:48-70`; `auth.controller.ts:34-46`; `auth.module.ts:15`
- **Solução proposta:** remover o `createMobileSession` placeholder (mover `revokeSession`/`me` se necessário).
- **Solução aplicada:** `POST /auth/mobile-session` consolidado em `AuthController`; `AuthControllerImpl` e seu arquivo foram removidos; `AuthModule` registra somente um controller de auth. DTO, throttle, status `201` e delegação ao `MobileSessionService` foram preservados.
- **Evidências/comandos:** busca por `@Post('mobile-session')` retorna uma ocorrência; teste de `AuthController` aprovado (3 testes); suíte backend completa (16 suítes, 83 testes); build backend aprovado.
- **Riscos residuais:** nenhum.
- **Próximo passo:** nenhum.
- **Relacionado:** —

### PROB-0026 — `fornecedor_id` do cliente não validado por tenant em Finance
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Área:** backend / segurança
- **Sintoma:** `createComissao`/`createParceiro` gravam `dto.fornecedor_id` (id numérico cru) sem checar se pertence ao tenant (diferente de `cliente_uuid`, resolvido com filtro de tenant).
- **Causa raiz:** confirmada.
- **Impacto técnico:** comissão/parceiro do tenant A referencia fornecedor do tenant B; `leftJoinAndSelect('c.fornecedor')` expõe `razao_social` do outro tenant em relatórios.
- **Arquivos/módulos:** `backend/src/finance/finance.service.ts:147`, `:314`; `create-comissao.dto.ts:11-13`
- **Solução proposta:** resolver/validar fornecedor por uuid+tenant como é feito com clientes.
- **Solução aplicada:** resolução central exige fornecedor ativo pelo par `id + tenant_id` antes de criar comissão ou parceiro; testes cobrem sucesso, cross-tenant e ausência opcional.
- **Evidências/comandos:** leitura de `finance.service.ts`.
- **Riscos residuais:** subconjunto de PROB-0011.
- **Próximo passo:** validar FK por tenant.
- **Relacionado:** PROB-0011

### PROB-0027 — Sistema de permissões granulares inoperante (`permissions` sempre `[]`)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Área:** frontend
- **Sintoma:** `permissions` é hardcoded `[]` a cada load; resultado de `/auth/me` não é mapeado. `hasPermission(slug)` só retorna true para admin.
- **Causa raiz:** confirmada.
- **Impacto técnico:** hoje nenhuma rota passa `permission` (só `adminOnly`), mas o prop `permission` de `ProtectedRoute` é uma armadilha viva para uso futuro. Duas entradas de `useAuth` (context vs hook) aumentam o risco de drift.
- **Arquivos/módulos:** `frontend/src/context/AuthContext.tsx:45,55,69-72`; `ProtectedRoute.tsx:29`
- **Solução proposta:** popular permissions da API ou remover a superfície morta.
- **Solução aplicada:** `/auth/me` retorna permissões efetivas tenant-scoped; guard usa mesma fonte; frontend popula `AuthContext.permissions`. Associação RBAC ganhou `tenant_id` e FK composta para `tenant_roles`.
- **Evidências/comandos:** leitura de `AuthContext.tsx`.
- **Riscos residuais:** relacionado a PROB-0014.
- **Próximo passo:** decidir ativar vs remover.
- **Relacionado:** PROB-0014

### PROB-0028 — `apiClient` sem fallback `/api` para `VITE_API_URL`
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** frontend
- **Sintoma:** `const BASE_URL = import.meta.env.VITE_API_URL;` sem `?? '/api'`, enquanto todos os outros módulos usam default `/api`. Se `VITE_API_URL` não setada, chamadas de dados viram `/clientes` (404) mas auth ainda funciona — falha parcial difícil de diagnosticar.
- **Causa raiz:** confirmada — tratamento de env inconsistente.
- **Impacto técnico:** 404 em todas as chamadas de dados quando env ausente.
- **Arquivos/módulos:** `frontend/src/lib/apiClient.ts:3`, `:30`
- **Solução proposta:** default `BASE_URL` para `/api`.
- **Solução aplicada:** `BASE_URL` usa `import.meta.env.VITE_API_URL ?? '/api'`, alinhado a `AuthContext` e `lib/auth.ts`.
- **Evidências/comandos:** busca no código atual confirma fallback em `frontend/src/lib/apiClient.ts:3`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** nenhum.
- **Relacionado:** —

### PROB-0029 — `ProtectedRoute` faz redirect como efeito de render
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** frontend
- **Sintoma:** `window.location.href = ...` no corpo de render do componente. Pode disparar a cada re-render / duas vezes sob StrictMode.
- **Causa raiz:** confirmada — navegação como efeito de render.
- **Impacto técnico:** redirect churn; monta URL de start OIDC a cada render.
- **Arquivos/módulos:** `frontend/src/components/ProtectedRoute.tsx:20-23`
- **Solução proposta:** mover para `useEffect`.
- **Solução aplicada:** fluxo OIDC removido; componente atual retorna `<Navigate to='/login' replace />` quando não há usuário, sem atribuição a `window.location` durante render.
- **Evidências/comandos:** leitura de `frontend/src/components/ProtectedRoute.tsx`; busca sem redirect OIDC ou `return_to` no componente.
- **Riscos residuais:** redirect 401 duplicado permanece separado em PROB-0035.
- **Próximo passo:** nenhum.
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
- **Status:** FECHADO_COM_RESSALVA
- **Verificado em:** 2026-07-12
- **Área:** LGPD
- **Sintoma:** `base.entity.ts:16` afirma "dados nunca são apagados fisicamente"; só existe soft delete. PII de cliente (`cnpj`, `email`, `tel`, `endereco`, `contato`) e de usuário (`email`, `nome`) retida indefinidamente, sem caminho de erasure/anonimização.
- **Causa raiz:** confirmada — só `softDelete`.
- **Impacto técnico:** não há como honrar pedido de titular (Art. 18).
- **Arquivos/módulos:** `backend/src/common/entities/base.entity.ts:16`; `clients.service.ts:82-85`; `sync.service.ts:100-103`
- **Solução proposta:** fluxo de anonimização/hard-delete para requisição de titular.
- **Solução aplicada:** state machine Admin e anonimização idempotente para clientes e usuários. Clientes têm PII removida e textos livres dos pedidos associados limpos; usuários têm identidade/credenciais anonimizadas, `access_token_version` incrementada, acesso desativado, espelho `local_users` anonimizado/desativado e sessões web/mobile revogadas. Referências legais/contábeis permanecem.
- **Evidências/comandos:** suíte backend completa `28 suites / 160 testes`, lint e build backend passaram em 2026-07-12; build/lint frontend passaram; fluxo exige smoke test PostgreSQL no rollout.
- **Riscos residuais:** matriz jurídica de retenção ainda deve ser homologada; execução técnica preserva relações por padrão seguro.
- **Próximo passo:** homologação jurídica e smoke test em PostgreSQL real.
- **Relacionado:** PROB-0032, BACKLOG-0007

### PROB-0032 — Sem trilha de auditoria de acesso/alteração de PII (LGPD Art. 37)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** MEDIUM
- **Status:** FECHADO_COM_RESSALVA
- **Verificado em:** 2026-07-12
- **Área:** LGPD
- **Sintoma:** grep por audit/log de acesso não encontrou nada. Nenhum registro de quem leu ou alterou PII. Só `console.error` ad-hoc em tenant mismatch.
- **Causa raiz:** confirmada.
- **Impacto técnico:** gap de accountability (Art. 37).
- **Arquivos/módulos:** projeto todo; `auto-provision.guard.ts:55`, `:72`
- **Solução proposta:** trilha de auditoria de acesso/modificação de PII.
- **Solução aplicada:** audit log append-only, isolado por tenant, cobre leitura/alteração de clientes, administração de usuários, exportação e apagamento LGPD; eventos de apagamento incluem campos livres dos pedidos sem registrar seus valores.
- **Evidências/comandos:** suíte backend completa `26 suites / 155 testes` e build backend passaram em 2026-07-12; testes de audit/privacy confirmam autorização e persistência sem valores PII.
- **Riscos residuais:** inventário jurídico deve ser revisto quando novos campos PII forem adicionados.
- **Próximo passo:** manter inventário e cobertura de auditoria nos reviews de domínio.
- **Relacionado:** PROB-0031, BACKLOG-0007

### PROB-0033 — Drift de índices em `comissoes` (migration ⊂ entidade)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** banco
- **Sintoma:** migration só cria `tenant_uuid`, `tenant_updated` e o índice quebrado de `pedido`. A entidade declara índices adicionais (`tenant_id,deleted_at`; `tenant_id,data_pedido`; `tenant_id,status`; `tenant_id,fornecedor_id`) omitidos na migration.
- **Causa raiz:** confirmada — drift dev↔prod.
- **Impacto técnico:** prod sem índices de soft-delete e de relatório.
- **Arquivos/módulos:** `001:118-121`; `commission.entity.ts:11-16`
- **Solução proposta:** sincronizar migration com o conjunto de índices da entidade.
- **Solução aplicada:** baseline efetiva `0000_baseline.sql` contém os índices compostos de `comissoes` para `(tenant_id, deleted_at)`, `(tenant_id, data_pedido)`, `(tenant_id, status)`, `(tenant_id, fornecedor_id)` e `(tenant_id, updated_at)`. Migration legada `001_*`, citada no sintoma, não é executada pelo runner de quatro dígitos.
- **Evidências/comandos:** cruzamento de `commission.entity.ts:11-16` com `0000_baseline.sql`; todos os índices antes ausentes foram encontrados.
- **Riscos residuais:** nenhum além de performance.
- **Próximo passo:** nenhum.
- **Relacionado:** PROB-0004, PROB-0006

### PROB-0034 — Dois modelos de permissão coexistem (`role_permissions` vs `tenant_role_permissions`)
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** banco
- **Sintoma:** modelo por role-string (`role_permissions`, migration 002) e modelo tenant-escopado (`tenant_role_permissions`, 003) coexistem; ambos referenciam `permissions.slug`. Provável legado vs atual — não reconciliado, possível schema morto (suposição).
- **Causa raiz:** suposição — evolução de modelo não limpa.
- **Impacto técnico:** confusão de modelagem; risco de decisão de permissão inconsistente.
- **Arquivos/módulos:** migrations `002`, `003`; entidades RBAC
- **Solução proposta:** decidir modelo único e remover o morto.
- **Solução aplicada:** `tenant_role_permissions` confirmado como único modelo consumido. Entidade global legada removida e migration `0022_remove_legacy_rbac_and_order_vendor_fk.sql` elimina `role_permissions` de instalações existentes.
- **Evidências/comandos:** busca confirma consumo exclusivo de `TenantRolePermission`; build e suíte backend completa passaram; migration real pendente de rollout PostgreSQL.
- **Riscos residuais:** interage com PROB-0012.
- **Próximo passo:** aplicar migration no rollout.
- **Relacionado:** PROB-0012

### PROB-0035 — Código morto/duplicado de auth no frontend
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** frontend
- **Sintoma atual:** fluxo OIDC, `AUTH_URL` hardcoded e Zustand `authStore.ts` já não existem. Restam dois resíduos: `main.tsx` remove `auth-storage` legado em todo bootstrap; `apiClient.ts` ainda repete redirect de 401 que `authFetch` já executa.
- **Causa raiz:** limpeza incompleta após migração para auth nativa.
- **Impacto técnico:** baixo; redirect 401 duplicado e shim legado sem função.
- **Arquivos/módulos:** `frontend/src/main.tsx:13`; `frontend/src/lib/auth.ts:23-29`; `frontend/src/lib/apiClient.ts:86-88`
- **Solução proposta:** remover limpeza de `auth-storage` e manter tratamento de 401 em uma única camada.
- **Solução aplicada:** store Zustand, callback/rotas OIDC, fallback ZonaDev, shim `auth-storage` e redirect 401 duplicado removidos; `authFetch` concentra refresh/redirect.
- **Evidências/comandos:** busca atual sem `authStore.ts`, `AuthCallback`, `AUTH_URL`, ZonaDev, OIDC, shim `auth-storage` ou redirect 401 duplicado; build frontend passou.
- **Riscos residuais:** nenhum.
- **Próximo passo:** nenhum.
- **Relacionado:** PROB-0027, PROB-0029

### PROB-0036 — Robustez menor (frontend + backend): itens LOW agrupados
- **Data:** 2026-07-08
- **Origem:** auditoria
- **Severidade:** LOW
- **Status:** PARCIALMENTE_RESOLVIDO
- **Área:** frontend / backend / segurança
- **Item backend/frontend resolvido em 2026-07-12:** precisão decimal padronizada por contrato único.
- **Itens resolvidos/removidos:** OIDC e seu open redirect removidos; `JwtAuthGuard` não possui mais fallback RS256→HS256; timezone PostgreSQL usa `extra.options = '-c timezone=UTC'`.
- **Itens mobile não reverificados nesta atualização:** mudança de `plan`, backoff e associação de resultados de push por índice; mantidos como pendentes até auditoria autorizada do workspace mobile.
- **Causa raiz:** confirmada por leitura em cada caso (exceto onde marcado suposição).
- **Impacto técnico:** individualmente baixo; hardening/robustez/consistência.
- **Solução proposta:** tratar por área junto das correções maiores.
- **Solução aplicada:** rota catch-all e loading visível adicionados; JWT fixa HS256; produção exige `CORS_ORIGIN`; pool DB e shutdown configurados; `Order.vendedor_id` ganhou relação/FK tenant-scoped. Campos PostgreSQL `NUMERIC` são strings no backend/frontend; DTOs financeiros aceitam decimal textual; cálculos e somas usam `decimal.js` com precisão 40 e `ROUND_HALF_UP`; frontend converte para `number` somente na fronteira de exibição do `Intl.NumberFormat`. Itens do workspace mobile seguem intocados por restrição explícita.
- **Evidências/comandos:** teste decimal cobre `0.10 + 0.20 = 0.30`, `1.005 = 1.01`, percentual e valor acima do limite seguro de centavos IEEE-754; testes focados `5/5`; suíte backend completa `28 suites / 160 testes`; lint/build backend e frontend; `git diff --check` passaram. Frontend lint mantém um warning não bloqueante preexistente de Fast Refresh.
- **Riscos residuais:** somente itens mobile agrupados neste PROB; não reverificados nem alterados.
- **Próximo passo:** nenhum no backend/frontend; tratar saldo mobile apenas após autorização explícita.
- **Relacionado:** BACKLOG-0008

---

## Revisão do prompt de migração Auth Nativa — 2026-07-08

Origem: análise do usuário (`docs/PossiveisErros.md`) sobre `Prompt_Auth_Nativa_Hardening_v1.md`, cruzada com o código atual. Relatório: [REVIEW_REPORTS/2026-07-08_security_review_auth-migration-prompt.md](REVIEW_REPORTS/2026-07-08_security_review_auth-migration-prompt.md). Só os apontamentos que **batem com o código atual** viram PROB; os pós-migração vão para BACKLOG-0009. Nenhum código alterado.

### PROB-0037 — Colunas de data em `TIMESTAMP WITHOUT TIME ZONE` corrompem o LWW
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** banco
- **Sintoma:** `@CreateDateColumn`/`@UpdateDateColumn`/`@DeleteDateColumn` na entidade base geram, no Postgres, colunas `timestamp without time zone`. O trigger `set_updated_at` grava `now()` (que é `timestamptz`); o offset é descartado no armazenamento. Comparações de conflito passam a depender do fuso do container.
- **Causa raiz:** confirmada — tipo default do TypeORM para `@*DateColumn` no Postgres é `timestamp` sem tz; `timezone:'UTC'` no `TypeOrmModule` é opção mysql-only e é ignorada no Postgres (ver PROB-0036).
- **Impacto técnico:** toda a estratégia de sync é "último `updated_at` vence" comparando timestamps entre mobile (offline, fuso local) e servidor. Sem tz, o LWW corrompe silenciosamente sob qualquer skew de fuso.
- **Arquivos/módulos:** `backend/src/common/entities/base.entity.ts:31-38`; `backend/src/database/migrations/001_initial_schema.sql:9-15`; `app.module.ts:50`
- **Solução proposta:** padronizar `TIMESTAMPTZ` em todas as colunas de data (`{ type: 'timestamptz' }` nas colunas da base + demais datas do financeiro); forçar `TimeZone=UTC` na conexão; entrar na migration baseline.
- **Solução aplicada:** migration incremental `0020_utc_timestamps_db_authority.sql` converte deterministicamente todo `timestamp without time zone` de `public` para `timestamptz` com `AT TIME ZONE 'UTC'`; metadata TypeORM declara `timestamptz`; conexões da aplicação e do runner usam sessão UTC. Migrations já aplicadas não foram reescritas, preservando checksums.
- **Evidências/comandos:** teste de contrato temporal, testes de sync/concorrência, suíte backend completa (95 testes) e build. Lint indisponível porque o workspace não possui binário ESLint instalado/configurado.
- **Riscos residuais:** conversão toma lock nas tabelas; deploy deve reservar janela compatível com o volume. Valores históricos são interpretados como UTC conforme contrato legado documentado. Apresentação deve usar `America/Sao_Paulo`; datas comerciais sem instante devem continuar como `DATE`.
- **Próximo passo:** monitorar duração e locks da migration no primeiro deploy com volume real.
- **Relacionado:** PROB-0022, PROB-0036, BACKLOG-0004, BACKLOG-0009

### PROB-0038 — Backend sem `trust proxy` atrás do Nginx Proxy Manager
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** MEDIUM
- **Status:** FECHADO_COM_RESSALVA
- **Área:** segurança / infra
- **Sintoma:** configuração anterior por contagem de dois saltos era dependente da topologia; frontend também sobrescrevia `X-Forwarded-Proto` com HTTP interno.
- **Causa raiz:** confiança baseada em distância e ausência de normalização segura dos cabeçalhos no último proxy.
- **Impacto técnico:** hoje parcial (throttle é por `user.sub`, não por IP — PROB-0036). Após a auth nativa vira pleno: cookie `Secure`/redirect por `req.secure` erra, lockout e rate-limit por IP enxergam o IP do proxy para todos os usuários, e a auditoria `ip INET` de `refresh_tokens` registra o IP do proxy.
- **Arquivos/módulos:** `backend/src/main.ts`, `backend/src/config/trust-proxy.config.ts`, `frontend/nginx.conf`, `docker-compose.prod.yml`.
- **Solução proposta:** confiar somente no endereço explícito do frontend, normalizar cabeçalhos e retirar acesso direto à API.
- **Solução aplicada:** rede interna `api_gateway`, frontend fixo em `172.30.0.2`, API sem porta publicada, `TRUST_PROXY=172.30.0.2/32`, validação fail-fast e cabeçalhos normalizados no nginx.
- **Evidências/comandos:** 43 testes backend; builds backend/frontend; `docker compose config --quiet`. Lint indisponível por ausência de ESLint/configuração no repositório.
- **Riscos residuais:** NPM deve permanecer na rede `proxy` e sobrescrever cabeçalhos recebidos do cliente.
- **Próximo passo:** validar `nginx -t`, executar smoke test HTTPS após deploy e confirmar IP real na auditoria.
- **Relacionado:** PROB-0036, BACKLOG-0009

### PROB-0039 — Dupla fonte de verdade para `updated_at` (trigger DB + `@UpdateDateColumn`)
- **Data:** 2026-07-08
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** banco / backend
- **Sintoma:** `@UpdateDateColumn` faz o TypeORM escrever `updated_at` pelo relógio da aplicação; o trigger `set_updated_at` sobrescreve com o relógio do banco em todo UPDATE. Ora um, ora outro é autoritativo dependendo do caminho de escrita (ORM vs. SQL cru do sync).
- **Causa raiz:** confirmada — dois mecanismos de timestamp ativos simultaneamente.
- **Impacto técnico:** qualquer skew entre relógio do app e do banco corrompe o LWW do sync (que compara `updated_at`). UPDATE via ORM tem o valor do app potencialmente sobrescrito pelo trigger — comportamento não-determinístico entre caminhos.
- **Arquivos/módulos:** `backend/src/common/entities/base.entity.ts:34-35`; `backend/src/database/migrations/001_initial_schema.sql:9-50`
- **Solução proposta:** escolher fonte única — o trigger do banco (relógio único, autoritativo). Configurar a coluna como `{ update: false }` (ou não usar `@UpdateDateColumn`) para o TypeORM não escrever `updated_at`. Documentar a decisão.
- **Solução aplicada:** PostgreSQL tornou-se autoridade exclusiva. `updated_at` é coluna TypeORM comum com `insert:false`/`update:false`; trigger `BEFORE INSERT OR UPDATE` usa `clock_timestamp()`. Escritas manuais foram removidas de sync, optimistic locking e anonimização LGPD. Migration garante trigger em toda tabela `public` que possua `updated_at`.
- **Evidências/comandos:** teste de metadata prova ausência de `@UpdateDateColumn`; testes de sync e optimistic locking provam ausência de atribuição manual; suíte backend completa (95 testes) e build. Lint indisponível porque o workspace não possui binário ESLint instalado/configurado.
- **Riscos residuais:** novas tabelas com `updated_at` devem receber trigger em sua própria migration; migration `0020` cobre todas as tabelas existentes no momento da execução.
- **Próximo passo:** manter contrato temporal nos reviews de novas migrations.
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
- **Status:** FECHADO
- **Verificado em:** 2026-07-12
- **Área:** backend
- **Sintoma:** `cnpj` e `cep` no DTO de cliente são apenas `@IsOptional() @IsString()` — sem checagem de dígito verificador (CNPJ) nem de formato (CEP). CNPJ inválido entra no cadastro e contamina cliente, pedido e o financeiro depois.
- **Causa raiz:** confirmada — leitura do DTO.
- **Impacto técnico:** dados inválidos persistidos; relatórios e integrações fiscais futuras herdam o lixo.
- **Arquivos/módulos:** `backend/src/clients/dto/create-client.dto.ts:17`, `:24` (e DTOs equivalentes de transportadora/fornecedor)
- **Solução proposta:** custom validators de CNPJ (dígito verificador) e CEP nos DTOs de cliente/transportadora/fornecedor.
- **Solução aplicada:** decorators reutilizáveis validam dígitos do CNPJ e formato de CEP; cliente, transportadora e fornecedor adotam CNPJ, cliente adota CEP; testes cobrem formatos válidos e inválidos.
- **Evidências/comandos:** testes dedicados de CNPJ/CEP, suíte backend completa `26 suites / 155 testes` e build backend passaram.
- **Riscos residuais:** dados legados já gravados continuam inválidos — validar só na entrada não limpa o passado.
- **Próximo passo:** saneamento separado para dados legados inválidos.
- **Relacionado:** BACKLOG-0009

---

## Auditoria de segurança/banco/campos quebrados cruzada contra specs e ledger — 2026-07-21

Origem: auditoria com 3 subagentes especialistas (segurança, banco, campos quebrados), 8 possíveis P0 levantados. Achados cruzados pelo usuário contra `/docs/renowa` (specs originais) e a documentação viva (`PROBLEM_LEDGER.md`, `BACKLOG.md`, `Prompt_Auth_Nativa_Hardening_v1.md`) antes de qualquer correção. Correções de segurança e telas faltantes implementadas nesta rodada; registrado pelo `docs-reporter` com verificação direta do código atual (leitura de arquivos e `git diff`, sem execução de suíte de testes — ambiente deste agente não possui `node`/`npm` instalados; resultados de teste abaixo são os reportados pelo agente implementador, não reexecutados por este agente).

**Achados descartados pela checagem cruzada (não geram PROB novo):**
- *Migration runner ignora arquivos de 3 dígitos* — já coberto por PROB-0004/0005/0006/0033 + BACKLOG-0004, todos FECHADO. Ledger já reflete corretamente; nenhuma ação necessária.

### PROB-0042 — `RolesController` sem guard de autorização (escalação de privilégio completa)
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente segurança) + implementação
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Área:** backend / segurança
- **Sintoma:** `backend/src/roles/roles.controller.ts` não tinha `@RequirePermission`/`@Roles` em nenhuma rota — só o `JwtAuthGuard` global (autenticação, não autorização). Qualquer usuário autenticado do tenant podia `GET /roles`, `GET /permissions` e `PATCH /roles/:id/permissions` e conceder qualquer permissão a si mesmo. `UsersController` tinha guard, mas usava o slug morto `'users.manage'`, nunca semeado no catálogo real de `0000_baseline.sql` (só `'usuarios.gerenciar'` existe, linha 1519) — funcionava por acidente só via bypass de admin embutido no `PermissionGuard`.
- **Causa raiz:** confirmada — `RolesController` nunca recebeu guard de autorização ao ser criado (presente desde o commit `2f54688`, 2026-03-20); `UsersController` recebeu guard com slug incorreto/inexistente no catálogo.
- **Impacto técnico:** escalação de privilégio completa — qualquer usuário do tenant conseguia se autopromover a qualquer role/permissão. Nunca pego pelas auditorias de 2026-07-08/2026-07-12 porque miravam outras superfícies.
- **Arquivos/módulos:** `backend/src/roles/roles.controller.ts` (todas as rotas), `backend/src/users/users.controller.ts:24,30,39`
- **Solução proposta:** adicionar `@RequirePermission('usuarios.gerenciar')` a todas as rotas de `RolesController`; corrigir slug de `UsersController` para o slug real do catálogo.
- **Solução aplicada:** `@RequirePermission('usuarios.gerenciar')` adicionado às 5 rotas de `RolesController` (list, create, update, remove, updatePermissions). `UsersController` trocou `'users.manage'` por `'usuarios.gerenciar'` nas 3 rotas que o usavam. Verificado por leitura direta do código atual (`backend/src/roles/roles.controller.ts` íntegro, `git diff backend/src/users/users.controller.ts` confirma a troca de slug).
- **Evidências/comandos:** `backend/src/roles/roles.controller.spec.ts` (novo), `backend/src/users/users.controller.spec.ts` (novo), `backend/src/common/guards/permission.guard.spec.ts` (novo) — arquivos confirmados presentes no working tree (`git status` os lista como `??`). Suíte completa reportada pelo implementador: 32/32 suites, 183/183 testes; build backend reportado como aprovado. **Não reexecutado por este agente** (ambiente sem `node`/`npm`).
- **Verificado em:** 2026-07-21 (teste manual real via Safari) — confirmado num navegador de verdade, não só por spec: usuário admin acessa `/configuracoes/roles` normalmente (guard não bloqueia quem tem `usuarios.gerenciar`).
- **Riscos residuais:** resultado de teste/build não reverificado por este agente; recomenda-se rodar a suíte antes do próximo deploy caso ainda não confirmado por outro meio.
- **Próximo passo:** nenhum no código; confirmar suíte verde num ambiente com Node antes de deploy, se ainda não feito.
- **Relacionado:** PROB-0043, PROB-0044, BACKLOG-0009

### PROB-0043 — Dois modelos de autorização incompatíveis nos controllers de negócio (`RolesGuard` estático vs `PermissionGuard` granular)
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente segurança) + implementação
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Área:** backend / segurança
- **Sintoma:** `FinanceController`, `ClientsController`, `OrdersController`, `ProductsController`, `TransportController`, `SuppliersController` combinavam `RolesGuard`+`@Roles('ADMIN'|'VENDEDOR'|'FINANCEIRO'|'GESTAO')` (modelo estático de 2026-03-20) com `PermissionGuard`+`@RequirePermission(slug)` (modelo granular por tenant via `tenant_role_permissions`, gerenciado pela tela "Perfis de acesso"). A criação de usuário tenant só produz `roles: ['admin'|'manager'|'viewer']` — `'manager'`/`'viewer'` nunca batem contra as 4 literais maiúsculas do `RolesGuard`, então todo usuário não-admin tomava `403` do `RolesGuard` antes mesmo do `PermissionGuard` avaliar a permissão granular. A tela "Perfis de acesso" era inoperante na prática para qualquer papel além de admin — inclusive o módulo Financeiro inteiro ficava inacessível a não-admins.
- **Causa raiz:** confirmada — dois sistemas de autorização concorrentes nunca reconciliados; vocabulário do `RolesGuard` (`'ADMIN'|'VENDEDOR'|'FINANCEIRO'|'GESTAO'`) incompatível com o vocabulário que a UI de criação de usuário produz (`'admin'|'manager'|'viewer'`).
- **Impacto técnico:** módulo Financeiro e demais controllers de negócio efetivamente admin-only na prática, apesar da tela de permissões granulares existir e sugerir controle fino por role.
- **Arquivos/módulos:** `backend/src/finance/finance.controller.ts`, `backend/src/clients/clients.controller.ts`, `backend/src/orders/orders.controller.ts`, `backend/src/products/products.controller.ts`, `backend/src/transport/transport.controller.ts`, `backend/src/suppliers/suppliers.controller.ts`
- **Solução proposta:** remover `RolesGuard`/`@Roles(...)` desses 6 controllers, mantendo só `@RequirePermission(slug)` + `PermissionGuard` (já com bypass de admin embutido).
- **Solução aplicada:** `RolesGuard`/`@Roles`/imports correspondentes removidos dos 6 controllers de negócio; confirmado por `grep` no código atual (nenhuma ocorrência de `RolesGuard`/`@Roles(` nos 6 arquivos) e `git diff backend/src/finance/finance.controller.ts` (remoção de `UseGuards(RolesGuard)` e `@Roles(...)`). `RolesGuard`/`@Roles` mantidos intactos e corretos em `AuditController` e `PrivacyController` (fora de escopo — usam só `'ADMIN'`, confirmado por leitura direta desses dois arquivos).
- **Evidências/comandos:** mesma suíte reportada de PROB-0042 (183/183, não reexecutada por este agente); teste dedicado reportado pelo implementador prova que `manager` com `financeiro.ver` concedido via `tenant_role_permissions` passa a acessar `GET /financeiro/dashboard`.
- **Verificado em:** 2026-07-21 (teste manual real via Safari, ambiente dev com Postgres real, `docker renowa-dev-postgres`) — smoke test end-to-end com usuário `manager` real que antes ficava bloqueado: usuário `manager` sem nenhuma permissão concedida tentando `/financeiro` recebe `403` (`GET /api/financeiro/fluxo-caixa` → 403 Forbidden); após o admin conceder `financeiro.ver` ao papel `manager` via tela "Perfis de acesso", o mesmo usuário passa a acessar `/financeiro` normalmente (200, dados carregam). Isso fecha a ressalva de smoke test pendente abaixo.
- **Riscos residuais:** nenhum residual quanto ao smoke test (confirmado em 2026-07-21). Tenant de teste usado é descartável (`94defbdd-3361-4481-a869-56d0e82d5c6d`), não reflete tenant de produção real.
- **Próximo passo:** nenhum.
- **Relacionado:** PROB-0014 (era sobre casing `ADMIN`/`admin`, já fechado; este é um problema diferente e mais profundo de vocabulário de role), PROB-0042

### PROB-0044 — IDOR em pedidos: vendedor acessa/edita/apaga pedido de colega do mesmo tenant
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente segurança) + implementação
- **Severidade:** HIGH
- **Status:** FECHADO
- **Área:** backend / segurança
- **Sintoma:** `orders.service.ts`: `findAll` já filtrava por `vendedor_id` quando o ator só tinha a role `VENDEDOR`, mas `findOne`, `updateStatus` e `remove` não replicavam esse filtro — só checavam `uuid + tenant_id`. Vendedor autenticado, sabendo o uuid de um pedido de outro vendedor do mesmo tenant, conseguia ler, mudar status e apagar esse pedido.
- **Causa raiz:** confirmada — checagem de ownership implementada só em `findAll`, nunca replicada nos outros métodos quando foram escritos.
- **Impacto técnico:** vendedor lê/edita/apaga pedido de outro vendedor do mesmo tenant sem autorização (IDOR clássico); diferente dos PROBs de isolamento cross-tenant (PROB-0011/PROB-0012), este é isolamento cross-vendedor dentro do mesmo tenant.
- **Arquivos/módulos:** `backend/src/orders/orders.service.ts:118-119` (`findAll`, já correto), `:149-154` (`isVendorOnly`/`vendorOwnershipWhere`, novo), `:173-174,193,205` (`findOne`/`updateStatus`/`remove`, corrigidos); `backend/src/orders/orders.controller.ts`; `backend/src/common/persistence/optimistic-concurrency.ts:28,41-42,72-73,97-98` (novo parâmetro `extraWhere`)
- **Solução proposta:** extrair checagem de ownership reutilizável e aplicá-la em `findOne`, `updateStatus` e `remove`.
- **Solução aplicada:** extraído `isVendorOnly(user)`/`vendorOwnershipWhere(user)` reutilizável; aplicado em `findOne` (migrado para querybuilder), `updateStatus` e `remove` via novo parâmetro opcional `extraWhere` em `optimistic-concurrency.ts` (retrocompatível — parâmetro opcional, não quebra chamadores existentes). Vendedor não-dono recebe `404` (não vaza existência do recurso). Verificado por leitura direta do código atual.
- **Evidências/comandos:** `backend/src/orders/orders.service.spec.ts` (novo, confirmado presente no working tree) cobre vendedor dono (passa) vs vendedor não-dono (404) vs roles não-vendedor (sem restrição). Suíte completa reportada pelo implementador (183/183), não reexecutada por este agente.
- **Verificado em:** 2026-07-21 (teste manual real via Safari, Postgres real) — 2 usuários semeados com `roles: ['VENDEDOR']` no mesmo tenant, cada um dono de 1 pedido criado via API autenticada. Logado como vendedor B, acessar `/pedidos/<uuid-do-pedido-do-vendedor-A>` retorna `404` (`GET /api/pedidos/:uuid` → 404 Not Found) — anti-IDOR por "não encontrado" em vez de `403`, comportamento intencional. Vendedor B acessando o próprio pedido funciona normal. Fecha a ressalva de smoke test pendente abaixo.
- **Riscos residuais:** nenhum residual quanto ao smoke test (confirmado em 2026-07-21) para o caminho `findOne`/leitura de detalhe. `updateStatus`/`remove` não foram reexercitados manualmente nesta rodada especificamente pelo vendedor não-dono (só `findOne`); a proteção nesses dois métodos segue coberta apenas por `orders.service.spec.ts` (specs com mocks).
- **Próximo passo:** nenhum no código; considerar auditoria semelhante em outros módulos com ownership por ator (ex.: se `TransportController`/`SuppliersController` algum dia ganharem noção de "dono"); opcionalmente repetir o teste manual para `updateStatus`/`remove` pelo vendedor não-dono.
- **Relacionado:** PROB-0011, PROB-0012 (cross-tenant, não cross-vendedor — problema distinto)

### PROB-0045 — Fornecedores sem UI no frontend (bloqueava aba Comissão do Financeiro)
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente campos quebrados) + implementação
- **Severidade:** MEDIUM
- **Status:** FECHADO
- **Verificado em:** 2026-07-21 (teste manual real via Safari)
- **Área:** frontend
- **Sintoma:** `SuppliersController` tinha CRUD completo no backend, mas nenhuma tela/rota/menu no frontend para cadastrar fornecedor — travava a aba Comissão do Financeiro, que depende de fornecedor cadastrado.
- **Causa raiz:** confirmada — backend implementado sem contraparte de UI.
- **Impacto técnico:** fluxo de comissão inoperável na prática pela falta de cadastro de fornecedor.
- **Arquivos/módulos:** `frontend/src/pages/Fornecedores.tsx` (novo), `frontend/src/App.tsx` (rota `/fornecedores`), `frontend/src/components/layout/Sidebar.tsx` (item de menu), `frontend/src/services/suppliers.service.ts` (novo), `frontend/src/types/index.ts` (tipo `Supplier`)
- **Solução proposta:** criar página de listagem/CRUD de fornecedores, rota e item de menu.
- **Solução aplicada:** nova página `Fornecedores.tsx` (listagem paginada, criar, editar, remover — soft delete), rota `/fornecedores`, item de menu, service dedicado e tipo `Supplier`. `Financeiro.tsx` não foi alterado (continua consumindo `/fornecedores` como antes). Confirmado por leitura direta: todos os arquivos citados existem no working tree.
- **Evidências/comandos:** `npm run build` frontend e `eslint` reportados como aprovados pelo implementador (não reexecutados por este agente — ambiente sem `node`/`npm`); rotas backend confirmadas no ar pelo implementador (`/api/fornecedores` respondeu 401 sem sessão, comportamento esperado). **Clique-through real (2026-07-21):** com usuário admin seedado localmente (`backend/scripts/create-admin.ts`), CRUD completo de fornecedor testado no Safari — cadastro com `razao_social`+`cnpj` (com máscara), edição, remoção (soft delete) — tudo funcionando. Isso fecha a ressalva de clique-through pendente abaixo.
- **Riscos residuais:** nenhum. O clique-through real que faltava foi feito em 2026-07-21 (ver BACKLOG-0011, agora FECHADO_COM_RESSALVA).
- **Próximo passo:** nenhum.
- **Relacionado:** BACKLOG-0011

### PROB-0046 — Pedido nascia sem itens e não podia ser editado (parcialmente corrigido: criação agora inclui itens; edição pós-criação segue indisponível)
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente campos quebrados) + implementação
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** frontend / backend
- **Sintoma:** `CreateOrderDto` aceitava `itens` mas nenhuma tela enviava; pedido nascia sem produto/valor; não havia rota de edição, só `PATCH /pedidos/:uuid/status`. `Pedidos.tsx` tinha um modal de criação inline duplicado e sem itens, paralelo ao fluxo de `PedidoForm.tsx`.
- **Causa raiz:** confirmada — tela de criação nunca foi conectada ao contrato de itens que o DTO já suportava; modal duplicado divergiu do fluxo canônico.
- **Impacto técnico:** pedidos criados via UI ficavam sem produto/valor, exigindo correção manual fora do fluxo; usuário não conseguia corrigir itens depois de criar o pedido.
- **Arquivos/módulos:** `frontend/src/pages/PedidoForm.tsx` (reescrito), `frontend/src/pages/Pedidos.tsx` (modal duplicado removido, navega para `/pedidos/novo`), `frontend/src/pages/PedidoDetalhe.tsx` (novo, rota `/pedidos/:uuid`), `frontend/src/services/products.service.ts` (novo), `frontend/src/types/index.ts`
- **Solução proposta:** conectar tela de criação ao contrato de itens existente; remover fluxo duplicado; expor detalhe/status do pedido.
- **Solução aplicada:** `PedidoForm.tsx` reescrito como fluxo canônico único de criação, com seleção de produto, quantidades, preço, desconto e cálculo de total por item. Nova página `PedidoDetalhe.tsx` mostra itens e permite mudar status via endpoint já existente (`PATCH .../status`). **Edição de itens depois de criado o pedido continua indisponível** — o backend só expõe `PATCH .../status`; nenhum endpoint de update genérico de itens foi criado nesta rodada (nem no backend, nem inventado no frontend contra um endpoint inexistente). Confirmado por leitura direta: todos os arquivos citados existem no working tree; nenhum novo endpoint de update de itens foi adicionado ao backend (fora do escopo tocado — ver `git status`, nenhum arquivo de `orders` além de `orders.service.ts`/`orders.controller.ts`, já cobertos por PROB-0044, foi alterado).
- **Evidências/comandos:** build frontend reportado como aprovado pelo implementador (não reexecutado por este agente). **Clique-through real (2026-07-21):** criação de pedido com cliente+produto+quantidade+preço testada no Safari; cálculo de total client-side conferiu com o total retornado pelo backend no cenário testado; detalhe do pedido (`/pedidos/:uuid`) e troca de status testados e funcionando (depois dos 3 bugs novos corrigidos nesta mesma sessão — ver PROB-0049/0050/0051).
- **Riscos residuais:** a fórmula usada para calcular `total_item` no frontend (`(qtd_caixas + qtd_unitaria) × preço_unitário × (1 − desconto_perc/100)`) é um default assumido pelo engenheiro de implementação, **não confirmado com o dono do produto** — não há campo de conversão entre caixa e unidade no schema de Produto. O teste manual de 2026-07-21 confirmou que o total client-side bate com o total do backend **para o cenário testado**, mas isso não substitui a validação de negócio: se a fórmula assumida estiver errada, cliente e servidor concordam consistentemente com o valor errado. Deve ser validado com o negócio antes de confiar nos totais em pedidos reais.
- **Próximo passo:** (1) validar fórmula de cálculo de item com o dono do produto; (2) implementar edição de itens pós-criação — ver BACKLOG-0010.
- **Relacionado:** BACKLOG-0010, BACKLOG-0011

### PROB-0047 — Comentário de unicidade de `usuarios.email` reavaliado — já correto no código atual
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente banco) + checagem cruzada
- **Severidade:** LOW
- **Status:** NÃO_REPRODUZIDO
- **Área:** banco / documentação
- **Sintoma relatado pela auditoria:** `usuarios.email` seria `UNIQUE` global, mas o comentário em `backend/src/users/entities/user.entity.ts:9` sugeriria (incorretamente) unicidade por tenant.
- **Checagem cruzada:** `docs/Prompt_Auth_Nativa_Hardening_v1.md:83` especifica `email VARCHAR UNIQUE NOT NULL` (sem qualificador de tenant) — unicidade global de email é decisão de produto documentada, não bug.
- **Verificação de código nesta rodada:** leitura direta de `backend/src/users/entities/user.entity.ts` mostra que o comentário **já está correto**: linha 8 diz "Email é global único"; linha 15 tem o comentário inline `// Auth nativa: email global único` no índice `@Index(['email'], { unique: true })`. A linha 9 (`CHANGELOG #2: UNIQUE(tenant_id, uuid) — mesmo usuário pode existir em dois tenants`) refere-se à unicidade do **uuid** por tenant, não do email — está correta e não é ambígua com a unicidade de email. `0000_baseline.sql:1078` confirma `CREATE UNIQUE INDEX ... ON public.usuarios USING btree (email)` — índice único global, consistente com o comentário e com a spec.
- **Causa raiz:** não aplicável — achado da auditoria não reproduzido contra o estado atual do código (`git log` mostra que o comentário já vinha correto desde o commit `d3934e2`, "feat(auth): add native backend authentication", que introduziu a auth nativa).
- **Impacto técnico:** nenhum — nenhuma mudança de código foi necessária ou feita.
- **Arquivos/módulos:** `backend/src/users/entities/user.entity.ts:8-9,15`; `backend/src/database/migrations/0000_baseline.sql:1078`; `docs/Prompt_Auth_Nativa_Hardening_v1.md:83`
- **Solução proposta:** nenhuma — nada a corrigir.
- **Solução aplicada:** nenhuma (nenhum código alterado por este agente, fora de escopo de qualquer forma).
- **Evidências/comandos:** `Read backend/src/users/entities/user.entity.ts`; `grep -n email backend/src/database/migrations/0000_baseline.sql`; `git log -p -1 -- backend/src/users/entities/user.entity.ts`.
- **Riscos residuais:** nenhum.
- **Próximo passo:** nenhum.
- **Relacionado:** —

### PROB-0048 — Mobile: navegação sem `onPress` e fila de sync offline nunca chamada (código morto) — informativo, sem ação de código
- **Data:** 2026-07-21
- **Origem:** auditoria (subagente campos quebrados)
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** mobile
- **Sintoma:** `mobile/src/screens/HomeScreen.tsx:107-110` — os `TouchableOpacity` do grid "Acesso rápido" não têm prop `onPress` (confirmado por leitura direta; contrasta com os botões de logout/sync na mesma tela, que têm `onPress`). Nenhuma tela do app permite criar/editar dados, então `enqueue()` de `mobile/src/storage/sync-queue.ts:16` nunca é chamado em lugar nenhum do app (confirmado por `grep` — só `HomeScreen.tsx` importa `getPendingCount` de `sync-queue.ts`; nenhum arquivo importa `enqueue`). A infraestrutura de fila de sync offline está completa e testável, mas é código morto porque não há UI que a alimente.
- **Causa raiz:** confirmada — telas de navegação/CRUD do mobile nunca foram implementadas além da Home; infraestrutura de sync foi construída antes/independente da UI que a consumiria.
- **Impacto técnico:** app mobile não permite ao usuário final criar ou editar nenhum dado; todo o ciclo de sync (push) fica sem uso real em produção.
- **Arquivos/módulos:** `mobile/src/screens/HomeScreen.tsx:107-110`; `mobile/src/storage/sync-queue.ts:16` (`enqueue`, nunca importado fora do próprio arquivo)
- **Solução proposta:** implementar as telas de CRUD (clientes, pedidos, produtos etc.) que faltam e conectar `enqueue()` aos formulários; adicionar `onPress` de navegação ao grid da Home.
- **Solução aplicada:** nenhuma. **Bloqueado por restrição de `AGENTS.md`** (`AGENTS.md:6`: "Não altere arquivos do workspace `mobile` nem implemente funcionalidades para mobile" — restrição só removível por instrução explícita do usuário) — requer autorização explícita do usuário para mexer no workspace mobile.
- **Evidências/comandos:** `grep -n onPress mobile/src/screens/HomeScreen.tsx`; `grep -rln sync-queue mobile/src`; `grep -n enqueue mobile/src/services/SyncService.ts mobile/src/screens/*.tsx` (sem ocorrência de `enqueue`).
- **Riscos residuais:** enquanto a restrição estiver vigente, o app mobile permanece sem funcionalidade real de criação/edição de dados para o usuário final.
- **Próximo passo:** retomar somente após autorização explícita para trabalhar no workspace `mobile`, no mesmo padrão de PROB-0024.
- **Relacionado:** PROB-0020, PROB-0021, PROB-0024

---

## Teste manual real end-to-end pelo frontend (Safari) — 2026-07-21

Origem: usuário rodou, numa sessão só, um roteiro de teste manual real pelo frontend do Renowa (Safari, via automação AppleScript/osascript — a extensão Claude-in-Chrome não estava disponível), validando o hotfix de segurança/telas registrado em PROB-0042 a PROB-0046 (mesma data), até então só verificado por build/lint/testes automatizados, nunca clicado num navegador de verdade. Ambiente: dev local, banco `renowa-dev-postgres` (docker, porta 5433), tenant de teste descartável `94defbdd-3361-4481-a869-56d0e82d5c6d`. Achados de PROB-0042/0043/0044 confirmados via clique real (ver atualizações nas entradas correspondentes acima); PROB-0045/0046 tiveram o clique-through real que faltava (ver BACKLOG-0011). Três bugs novos, fora do escopo do hotfix, foram encontrados e corrigidos só porque o teste foi feito num navegador de verdade — registrados abaixo. Os 3 fixes estão no working tree, **sem commit** nesta sessão (ver BUGFIX_LOG BUG-0008/0009/0010).

### PROB-0049 — Cookies `Secure` fixos quebravam login no Safari em dev local (silencioso)
- **Data:** 2026-07-21
- **Origem:** teste manual
- **Severidade:** LOW (impacto em produção é nulo — lá sempre há HTTPS; o achado é de DX/testabilidade, não de segurança)
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend / infra
- **Sintoma:** `POST /auth/login` retornava `204` com `Set-Cookie` correto, mas o Safari descartava silenciosamente os cookies porque tinham `Secure: true` fixo e a página era servida em `http://localhost` (sem HTTPS). Diferente do Chrome/Edge, o Safari não trata `localhost` como origem confiável para fins do atributo `Secure`. Resultado: login "funcionava" (204) mas o usuário nunca ficava autenticado de fato — `GET /auth/me` sempre voltava `401` "Token não fornecido", e o frontend silenciosamente devolvia para a tela de login sem nenhuma mensagem de erro visível (`Login.tsx` só trata erro se `login()` lançar; `login()` não lança nesse caso — `loadUser()` trata `401` como "sem usuário" e resolve normal).
- **Causa raiz:** confirmada — `secure: true` fixo em `setAuthCookies`, sem distinguir ambiente.
- **Impacto técnico:** bloqueador real e silencioso para qualquer teste manual local em Safari (não afeta produção, onde HTTPS é sempre usado).
- **Arquivos/módulos:** `backend/src/auth/cookie.util.ts:12` (constante `SECURE_COOKIES`), `:19`, `:23`
- **Solução proposta:** `secure` condicional a `NODE_ENV === 'production'`.
- **Solução aplicada:** `SECURE_COOKIES = process.env.NODE_ENV === 'production'` substitui o `true` fixo nos dois `res.cookie(...)` de `setAuthCookies`. Em produção o comportamento não muda (sempre HTTPS lá). Confirmado por leitura direta do arquivo no working tree.
- **Evidências/comandos:** repetição do login no Safari após o fix — `POST /auth/login` → `204`, `GET /auth/me` → `200` com usuário autenticado; sessão persiste entre navegações.
- **Riscos residuais:** correção está no working tree, **sem commit** nesta sessão; sem teste automatizado de regressão cobrindo o valor de `secure` por ambiente.
- **Próximo passo:** commit da correção (fora do escopo deste agente); considerar teste unitário simples de `cookie.util.ts` cobrindo `NODE_ENV=production` vs outros valores.
- **Relacionado:** BUG-0008

### PROB-0050 — `ResponseInterceptor` não envolvia a resposta quando a entidade tem uma coluna de domínio chamada `data`
- **Data:** 2026-07-21
- **Origem:** teste manual
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend
- **Sintoma:** `GET /pedidos/:uuid` retornava o pedido "cru" (sem o wrap `{ data: ... }` que toda resposta de sucesso da API deveria ter). O frontend (`frontend/src/services/orders.service.ts:15`, `fetchOrder`) sempre faz `res.data.data`, então `data.data` vinha `undefined`, e a tela `PedidoDetalhe.tsx` caía direto no estado de erro "Não foi possível carregar o pedido" mesmo com a API respondendo `200` com os dados certos.
- **Causa raiz:** confirmada — a entidade `Pedido` (e também `FinanceMovement`, mesma coluna) tem uma coluna de domínio chamada literalmente `data` (a data do pedido/lançamento). O `ResponseInterceptor` tinha uma heurística "se o objeto já tem uma chave `data`, assume que já está no formato `{data: ...}` e não envolve de novo" — pensada para evitar re-envolver respostas paginadas (`{data: [...], meta: {...}}`), mas qualquer entidade com uma coluna chamada `data` colidia com essa heurística e saía sem o wrap. Confirmado por grep que nenhum controller do projeto retorna `{data: X}` manualmente — só o próprio interceptor faz isso — logo o caso "já é `{data}` sozinho, sem `meta`" nunca acontecia de propósito, só por acidente via esse campo de domínio.
- **Impacto técnico:** qualquer endpoint que devolve diretamente uma entidade `Pedido` ou `FinanceMovement` (não paginada) sai sem o wrap `{data}`, quebrando o contrato que todo consumidor do frontend assume (`res.data.data`). Confirmado quebrando `GET /pedidos/:uuid`; `GET /financeiro/movimentacoes/:uuid` tem a mesma coluna `data` e presumivelmente o mesmo problema, mas não foi testado diretamente nesta sessão.
- **Arquivos/módulos:** `backend/src/common/interceptors/response.interceptor.ts:34`; consumido em `frontend/src/services/orders.service.ts:15`; `frontend/src/pages/PedidoDetalhe.tsx`
- **Solução proposta:** condição de "já está embrulhado" deve exigir o shape real de `PaginatedResponse<T>` (`data` **e** `meta`), não só `data`.
- **Solução aplicada:** condição alterada de `'data' in obj` para `'data' in obj && 'meta' in obj` (o shape real de `PaginatedResponse<T>`, `backend/src/common/dto/pagination.dto.ts:23`). Comentário do arquivo atualizado para explicar a colisão. Confirmado por leitura direta do arquivo no working tree.
- **Evidências/comandos:** repetição de `GET /pedidos/:uuid` no Safari após o fix — resposta chega envolta em `{data: {...}}`, `PedidoDetalhe.tsx` renderiza normalmente.
- **Riscos residuais:** correção está no working tree, **sem commit** nesta sessão. Não existe `response.interceptor.spec.ts` — nenhum teste automatizado cobre este interceptor (confirmado, arquivo de spec não existe). `GET /financeiro/movimentacoes/:uuid` (mesma coluna `data` em `FinanceMovement`) não foi testado diretamente, só presumido corrigido pela mesma mudança.
- **Próximo passo:** commit da correção (fora do escopo deste agente); adicionar `response.interceptor.spec.ts` (ver BACKLOG-0013); testar diretamente `GET /financeiro/movimentacoes/:uuid` para confirmar.
- **Relacionado:** BUG-0009, BACKLOG-0013

### PROB-0051 — `PATCH /pedidos/:uuid/status` devolvia o pedido sem a relação `itens`, quebrando a tela de detalhe
- **Data:** 2026-07-21
- **Origem:** teste manual
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend
- **Sintoma:** ao trocar o status de um pedido pela tela de detalhe (`PedidoDetalhe.tsx`), a resposta da API vinha `200` com sucesso (o backend salvava certo — confirmado recarregando a página que o novo status persistia), mas a tela quebrava imediatamente com tela branca. Erro no console: `TypeError: undefined is not an object (evaluating 'order.itens.length')` em `PedidoDetalhe.tsx:286` (`order.itens.length === 0 ? ... : ...`, renderizando a tabela de itens).
- **Causa raiz:** confirmada — `updateStatus` chamava o helper genérico `optimisticUpdate` (`backend/src/common/persistence/optimistic-concurrency.ts`), que faz um `UPDATE ... RETURNING *` cru via query builder — devolve só as colunas da própria tabela `pedidos`, sem nenhuma relação (`itens`, `itens.produto`, `cliente`, etc.) que `findOne` carrega explicitamente via `leftJoinAndSelect`. O frontend trata qualquer `Order` vindo da API como tendo sempre `itens` presente (contrato implícito, sem optional chaining), então a resposta parcial do PATCH quebrava o render assim que `setOrder(updated)` disparava o re-render.
- **Impacto técnico:** qualquer troca de status de pedido pela UI causava crash de tela (tela branca), apesar do backend persistir corretamente.
- **Arquivos/módulos:** `backend/src/orders/orders.service.ts:184-198` (`updateStatus`); `backend/src/common/persistence/optimistic-concurrency.ts`; `frontend/src/pages/PedidoDetalhe.tsx:286`
- **Solução proposta:** `updateStatus` deve devolver o mesmo contrato de `findOne` (com relações carregadas) após confirmar sucesso do `optimisticUpdate`.
- **Solução aplicada:** `updateStatus` agora, depois de confirmar que o `optimisticUpdate` teve sucesso (senão já lançou `404`/`409` antes), chama `this.findOne(uuid, user)` e devolve o resultado completo — mesmo contrato de `findOne`, sem exceção para o frontend tratar (`orders.service.ts:195-197`). Os 2 testes de `orders.service.spec.ts` que esperavam o retorno cru do `optimisticUpdate` (`permite ao vendedor mudar status do próprio pedido` e `não restringe por vendedor para ADMIN`) foram ajustados para usar `jest.spyOn(service, 'findOne')` em vez de comparar com a linha crua. Confirmado por leitura direta do arquivo no working tree.
- **Evidências/comandos:** repetição da troca de status pelo Safari após o fix — `PATCH /pedidos/:uuid/status` → `200`, tela de detalhe renderiza normalmente com os itens presentes. Reportado pelo usuário: os 8 testes de `orders.service.spec.ts` passam após o ajuste (não reexecutado por este agente — ambiente sem `node`/`npm`).
- **Riscos residuais:** correção está no working tree, **sem commit** nesta sessão. Qualquer outro método de escrita que use `optimisticUpdate`/`optimisticSoftDelete` diretamente (fora de `orders.service.ts`) pode ter o mesmo problema se o tipo de retorno for consumido esperando relações carregadas — não auditado nesta sessão (ver BACKLOG-0014).
- **Próximo passo:** commit da correção (fora do escopo deste agente); reexecutar `orders.service.spec.ts` num ambiente com Node para confirmar os 8/8; grep por outros usos de `optimisticUpdate(`/`optimisticSoftDelete(` no backend (ver BACKLOG-0014).
- **Relacionado:** BUG-0010, BACKLOG-0014, PROB-0040

### PROB-0052 — `SYSTEM_OVERVIEW.md` descreve fluxo de autenticação web desatualizado (ZonaDevAuth/JWKS em vez de auth nativa)
- **Data:** 2026-07-21
- **Origem:** documentação (achado incidental durante o registro do teste manual desta sessão)
- **Severidade:** LOW
- **Status:** FECHADO
- **Área:** documentação
- **Sintoma:** `docs/SYSTEM_OVERVIEW.md` (seção "Fluxo de autenticação", não atualizada desde 2026-07-08) descrevia o fluxo web como "cookie HTTP-only emitido pelo ZonaDevAuth. Token RS256 validado via JWKS com `jose`". O código atual não tem mais nenhuma dessas peças para o fluxo web: `backend/src/auth/native-auth.service.ts` implementa login nativo por `email`+`senha` (hash local, `PasswordService`), emitindo par `access_token`/`refresh_token` HS256 próprio (`AccessTokenService`/`RefreshTokenService`) em cookies `renowa_at`/`renowa_rt` (`cookie.util.ts`, tocado nesta sessão — ver PROB-0049). `grep -rln "ZonaDev\|jose" backend/src/auth backend/src/main.ts` não retorna nenhum arquivo.
- **Causa raiz:** confirmada — a migração para auth nativa (commit `d3934e2`, "feat(auth): add native backend authentication", referenciada em PROB-0037/0039/0040/BACKLOG-0009 como já concluída em 2026-07-12) não foi refletida na seção de auth do `SYSTEM_OVERVIEW.md`, que continuou descrevendo o fluxo antigo pré-migração.
- **Impacto técnico:** leitor da documentação viva é levado a um modelo mental incorreto do fluxo de auth web (acha que ainda depende de um IdP externo via JWKS); risco de decisão errada em revisão de segurança ou onboarding futuro que confie nesse trecho sem checar o código.
- **Arquivos/módulos:** `docs/SYSTEM_OVERVIEW.md` (seção "Fluxo de autenticação"); `backend/src/auth/native-auth.service.ts`; `backend/src/auth/access-token.service.ts`; `backend/src/auth/refresh-token.service.ts`; `backend/src/auth/cookie.util.ts`; `backend/src/auth/password.service.ts`
- **Solução proposta:** reescrever a seção "Fluxo de autenticação" do `SYSTEM_OVERVIEW.md` para refletir o fluxo nativo atual.
- **Solução aplicada:** seção reescrita nesta sessão (ver `docs/SYSTEM_OVERVIEW.md`) descrevendo login nativo por `email`+`senha`, cookies `renowa_at`/`renowa_rt` (`httpOnly`, `sameSite: strict`, `secure` condicional a produção — PROB-0049), par access/refresh HS256, rotação de refresh e mobile via `POST /api/auth/mobile-session`.
- **Evidências/comandos:** `grep -rln "ZonaDev\|zonadev\|jose\b" backend/src/auth backend/src/main.ts` → sem saída; leitura direta de `native-auth.service.ts`, `cookie.util.ts`; `git log --oneline -- backend/src/auth/native-auth.service.ts` confirma a migração já concluída (`d3934e2`).
- **Riscos residuais:** nenhum código de aplicação foi alterado (fora de escopo deste agente); demais seções do `SYSTEM_OVERVIEW.md` (multi-tenant, sync) não foram reauditadas nesta rodada — podem ter drift semelhante ainda não descoberto.
- **Próximo passo:** revisão geral de todo o `SYSTEM_OVERVIEW.md` contra o código atual na próxima auditoria completa.
- **Relacionado:** PROB-0049

---

## Continuação do teste manual real end-to-end pelo frontend (Safari) — 2026-07-21

Origem: mesma sessão de teste manual real pelo frontend do Renowa (Safari, via osascript/AppleScript), continuando de onde a rodada anterior parou (ver seção acima, PROB-0049 a PROB-0052 e BACKLOG-0011/0012). Cobertura desta continuação: cadastro de Produtos, Fornecedores (reconfirmado), Clientes, Pedido completo (criação + detalhe + troca de status), e as 6 abas do módulo Financeiro (Fluxo de Caixa, Empresas, Parceiros, Comissão, Custos, Inadimplência). Mesmo ambiente: tenant de teste `94defbdd-3361-4481-a869-56d0e82d5c6d`, usuário `admin@renowa.local`, banco `renowa-dev-postgres` (docker, porta 5433). Dois bugs novos foram encontrados e corrigidos (PROB-0053, PROB-0054, ambos no working tree, **sem commit** — ver BUGFIX_LOG BUG-0011/0012); um achado menor de UX não corrigido foi registrado só em backlog (ver BACKLOG-0015). Confirmações de regressão sem bug novo: login no Safari (PROB-0049 continua corrigido), CRUD de Fornecedor, criação de Pedido com itens e troca de status preservando `itens` (PROB-0051 continua corrigido), cadastro de Produto e Cliente, e os fluxos de criação/listagem/remoção nas 6 abas do Financeiro (depois do fix de PROB-0053).

### PROB-0053 — `forbidNonWhitelisted` rejeitava com 400 os filtros de query em 3 abas do Financeiro (Comissão, Parceiros, Custos)
- **Data:** 2026-07-21
- **Origem:** teste manual
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend
- **Sintoma:** as abas "Comissão", "Parceiros" e "Custos" do Financeiro (`frontend/src/pages/Financeiro.tsx`) mostravam "Não foi possível carregar...". Erro real confirmado via `fetch` direto no console do Safari contra `GET /financeiro/comissoes?mes=7&ano=2026&limit=100`: `400 BAD_REQUEST` — `"property mes should not exist; property ano should not exist"`.
- **Causa raiz:** confirmada — `backend/src/finance/finance.controller.ts` misturava, na mesma rota, um `@Query() pagination: PaginationDto` (que faz o `ValidationPipe` validar o objeto **inteiro** da query string contra essa DTO, que só declara `page`/`limit`/`search`) com decorators `@Query('mes')`, `@Query('ano')`, `@Query('fornecedor_id')`, `@Query('status')`, `@Query('tipo')`, `@Query('nome_parceiro')` individuais em paralelo. Como o `ValidationPipe` global (`backend/src/main.ts:33-34`) usa `whitelist: true, forbidNonWhitelisted: true`, qualquer propriedade da query string que não exista na DTO usada em `@Query()` é rejeitada com `400` — mesmo que essa mesma propriedade também seja capturada por um `@Query('x')` individual à parte na assinatura do handler. Afetava 4 handlers: `GET /financeiro/lancamentos` (`tipo`+`mes`+`ano`), `GET /financeiro/comissoes` (`fornecedor_id`+`mes`+`ano`+`status`), `GET /financeiro/parceiros` (`nome_parceiro`+`mes`+`ano`) e `GET /financeiro/movimentacoes` (`tipo`).
- **Impacto técnico:** 3 das 6 abas do módulo Financeiro (Comissão, Parceiros, Custos — este último usa a rota de lançamentos com filtro `tipo`) ficavam inoperáveis em qualquer chamada que incluísse os filtros próprios da tela; a listagem sem filtro (`GET /financeiro/comissoes` sem `mes`/`ano`) não é o caminho usado pela UI, que sempre envia esses parâmetros.
- **Arquivos/módulos:** `backend/src/finance/finance.controller.ts` (rotas `findAll`, `findAllComissoes`, `findAllParceiros`, `findAllMovimentacoes`); `backend/src/main.ts:33-34` (`ValidationPipe` global); `backend/src/common/dto/pagination.dto.ts`
- **Solução proposta:** substituir a mistura de `@Query() pagination: PaginationDto` + `@Query('x')` individuais por uma única DTO por rota, estendendo `PaginationDto` e declarando os campos de filtro como propriedades validadas.
- **Solução aplicada:** criado `backend/src/finance/dto/query-financeiro.dto.ts` com 4 DTOs — `LancamentosQueryDto` (`tipo`, `mes`, `ano`), `MovimentacoesQueryDto` (`tipo`), `ComissoesQueryDto` (`fornecedor_id`, `mes`, `ano`, `status`), `ParceirosQueryDto` (`nome_parceiro`, `mes`, `ano`) — todos estendendo `PaginationDto` e usando `@IsOptional() @IsString()` nos campos de filtro. `finance.controller.ts` atualizado para usar um único `@Query() query: XDto` por rota nos 4 handlers afetados, em vez da mistura de decorators. Nenhuma mudança nos services (que já liam `pagination.page`/`pagination.limit`, preservados pela herança de `PaginationDto`, e recebiam os filtros como parâmetros posicionais separados, também preservados).
- **Evidências/comandos:** reprodução do `400` confirmada via `fetch('/api/financeiro/comissoes?mes=7&ano=2026&limit=100', {credentials:'include'})` antes do fix; `200` depois. Confirmado também via clique real no Safari nas 3 abas afetadas (Comissão, Parceiros, Custos com filtro de tipo/mês/ano carregaram e uma comissão/parceiro/lançamento foram criados com sucesso em cada aba). Suíte de testes do backend (`npm run test`, reportado pelo usuário: 32 suites / 183 testes) roda 100% verde depois do fix, incluindo `finance.service.spec.ts` — **não reexecutado por este agente** (ambiente sem `node`/`npm`).
- **Riscos residuais:** correção está no working tree, **sem commit** nesta sessão. Resultado de teste (32/183) não reverificado por este agente. Não existe teste automatizado de nível controller (e2e/integração passando pelo `ValidationPipe` real) cobrindo o contrato HTTP das rotas do Financeiro — `finance.service.spec.ts` testa a camada de serviço direto, sem passar pelo `ValidationPipe` do controller, então esse tipo de erro de contrato HTTP não é pego por ela (é por isso que o bug existiu sem ser notado). Não foi auditado se outros controllers do backend têm a mesma mistura de `@Query() dto` + `@Query('x')` individuais na mesma rota (suposição: pode existir em outros módulos, não verificado).
- **Próximo passo:** commit da correção (fora do escopo deste agente); considerar teste e2e/integração mínimo por controller cobrindo o `ValidationPipe` real; grep por outras rotas que misturem `@Query() dto` com `@Query('x')` individuais no mesmo handler.
- **Relacionado:** BUG-0011

### PROB-0054 — Data do pedido exibida com 1 dia a menos em `Pedidos.tsx`/`PedidoDetalhe.tsx` (mesma classe de bug de timezone já corrigida no Financeiro)
- **Data:** 2026-07-21
- **Origem:** teste manual
- **Severidade:** MEDIUM
- **Status:** FECHADO_COM_RESSALVA
- **Área:** frontend
- **Sintoma:** pedido criado com data `2026-07-21` (confirmado direto no Postgres: `select data from pedidos` retornava `2026-07-21`), mas a tela de listagem (`/pedidos`) e a tela de detalhe (`/pedidos/:uuid`) mostravam "20/07/2026" — um dia a menos.
- **Causa raiz:** confirmada — `frontend/src/pages/Pedidos.tsx:57` e `frontend/src/pages/PedidoDetalhe.tsx:100` faziam `new Date(row.data).toLocaleDateString('pt-BR')` diretamente sobre uma string de data pura (`"2026-07-21"`, sem componente de horário). O JS interpreta uma string `YYYY-MM-DD` sem horário como meia-noite **UTC**; ao formatar no fuso local (Brasil, UTC-3), a conversão de volta ao horário local recua para o dia anterior. É a mesma classe de bug que já havia sido corrigida em `frontend/src/pages/Financeiro.tsx` (helper local `fmtDate`, que usa `new Date(d + 'T00:00:00')` para forçar meia-noite **local** em vez de UTC) — o fix não tinha sido replicado para as duas telas de Pedido.
- **Impacto técnico:** qualquer pedido exibia data incorreta (um dia a menos) nas duas telas onde a data do pedido aparece; risco de confusão operacional (conferência de pedido do dia, relatórios visuais) mesmo com o dado correto no banco.
- **Arquivos/módulos:** `frontend/src/lib/format.ts` (novo helper `formatDate`); `frontend/src/pages/Pedidos.tsx:57`; `frontend/src/pages/PedidoDetalhe.tsx:100`; `frontend/src/pages/Financeiro.tsx:11` (`fmtDate`, mesma técnica, não consolidado — ver BACKLOG-0016)
- **Solução proposta:** usar a mesma técnica do `fmtDate` do Financeiro (`new Date(value + 'T00:00:00')`) nas duas telas de Pedido, idealmente via helper compartilhado.
- **Solução aplicada:** criado helper compartilhado `formatDate` em `frontend/src/lib/format.ts` (mesma técnica do `fmtDate` do Financeiro: `new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')`), usado agora em `Pedidos.tsx` e `PedidoDetalhe.tsx` no lugar do `new Date(...).toLocaleDateString(...)` direto. `fmtDate` do Financeiro não foi tocado nem consolidado nesta correção (ver ressalva abaixo e BACKLOG-0016).
- **Evidências/comandos:** antes do fix, tela mostrava "20/07/2026" em `/pedidos` e `/pedidos/:uuid`; depois do fix (hot-reload do Vite), mostra "21/07/2026" em ambas, confirmado via clique real no Safari.
- **Riscos residuais:** correção está no working tree, **sem commit** nesta sessão. O helper `fmtDate` de `Financeiro.tsx` permanece duplicado dentro do próprio arquivo em vez de reusar o novo `formatDate` de `lib/format.ts` — mesma lógica em dois lugares é o tipo de duplicação que já permitiu esse bug existir numa terceira tela sem ser notado (ver BACKLOG-0016).
- **Próximo passo:** commit da correção (fora do escopo deste agente); consolidar `fmtDate`/`formatDate` num único helper (ver BACKLOG-0016).
- **Relacionado:** BUG-0012, BACKLOG-0016

---

## Reescrita do Dashboard (mock hardcoded → dado real) — 2026-07-21

Origem: implementação com plano aprovado pelo usuário. `frontend/src/pages/Dashboard.tsx` + `backend/src/finance/finance.service.ts` (método `getDashboard`) eram quase inteiramente mock hardcoded zerado — só 4 métricas financeiras (`totalVendas`, `totalCustoFixo`, `totalCustoRotativo`, `totalComissoes`/`totalInadimplencia`) vinham de fato da API; "Evolução de Venda", "Resumo" (pedidos abertos/produtos ativos), "Desempenho Mensal", "Carteira de Clientes", "Positivação" e "Curva ABC de Clientes" eram todos arrays/constantes zeradas no frontend (`salesData`, `desempenhoData`, `carteiraData`, `positivacaoData`, `abcData`, todas com `value: 0` fixo). Correção: mock removido; widgets ligados a pedidos/clientes/produtos reais via SQL cru em `FinanceService` (mesmo padrão `this.dataSource.query(...)` já usado no arquivo para outras métricas); card "Desempenho Mensal" removido (dependia de conceito de "Meta" não implementado em nenhuma parte do sistema — decisão de não inventar dado/funcionalidade inexistente). Heurísticas usadas, sem migration nova, por decisão aprovada do usuário: cliente ativo = pedido não-cancelado nos últimos 90 dias; prospect = cliente sem nenhum pedido não-cancelado histórico; positivação = % de clientes com pedido não-cancelado no mês corrente. Depois da implementação, smoke test manual real (Safari via osascript, backend NestJS porta 3000 + frontend Vite porta 5173 locais contra Postgres `renowa-dev-postgres`, login `admin@renowa.local` no tenant `94defbdd-3361-4481-a869-56d0e82d5c6d`) encontrou e corrigiu 3 bugs de dado real (ver PROB-0055 abaixo e BUGFIX_LOG BUG-0013/0014/0015), do tipo que não aparece em teste unitário com dado sintético pequeno.

### PROB-0055 — Dashboard inteiro era mock hardcoded zerado; reescrita para dado real revelou 3 bugs só visíveis com dado de produção real
- **Data:** 2026-07-21
- **Origem:** implementação
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend / frontend
- **Sintoma:** o Dashboard (`GET /financeiro/dashboard` + `frontend/src/pages/Dashboard.tsx`) exibia "Evolução de Venda", "Resumo" (pedidos abertos, produtos ativos), "Desempenho Mensal", "Carteira de Clientes", "Positivação" e "Curva ABC de Clientes" sempre zerados ou com dado fixo (`value: 0`), independentemente do volume real de pedidos/clientes/produtos no banco. Só as métricas financeiras de topo (`totalVendas`, `totalCustoFixo`, `totalCustoRotativo`, `totalComissoes`, `totalInadimplencia`) vinham de fato da API.
- **Causa raiz:** confirmada, por leitura direta do código antes da correção — `frontend/src/pages/Dashboard.tsx` declarava `salesData`, `desempenhoData`, `carteiraData`, `positivacaoData` e `abcData` como constantes de módulo com valores fixos em `0` (comentário no código: `// ─── Dados zerados ───`), nunca lidas da resposta da API; `backend/src/finance/finance.service.ts#getDashboard` só calculava as 5 métricas financeiras de topo, sem nenhuma query para pedidos/clientes/produtos que alimentasse os demais widgets.
- **Impacto técnico:** o dashboard operacional principal do sistema não refletia nenhum dado real de negócio (vendas, carteira de clientes, positivação, ranking de clientes) — usuário via um painel aparentemente funcional mas sem nenhuma informação acionável nesses widgets, risco de decisão operacional tomada às cegas ou de o problema nunca ter sido notado por parecer "vazio por falta de dado" em vez de "quebrado".
- **Arquivos/módulos:** `frontend/src/pages/Dashboard.tsx`; `backend/src/finance/finance.service.ts:523` (`getDashboard`, agora com queries adicionais até ~linha 700)
- **Solução proposta:** substituir todo mock por dado real: vendas mensais e ranking de clientes via SQL agregado; contagem de pedidos abertos e produtos ativos; carteira de clientes (ativo/inativo/prospect) e positivação via heurística sem migration nova (aprovada pelo usuário); remover "Desempenho Mensal" por depender de conceito de "Meta" inexistente no sistema.
- **Solução aplicada:** `getDashboard` passou a rodar, em paralelo (`Promise.all`), consultas SQL cruas via `this.dataSource.query(...)` (mesmo padrão já usado no arquivo) para: pedidos em aberto (`COUNT(*) WHERE status = 'em_aberto'`); produtos ativos (`COUNT(*)` em `produtos` não deletados); total de clientes; clientes ativos (pedido não-cancelado nos últimos 90 dias, `DISTINCT cliente_id`); clientes com histórico (qualquer pedido não-cancelado, para derivar prospect = total − com-histórico); positivação (clientes com pedido não-cancelado no mês corrente, `date_trunc('month', CURRENT_DATE)`); série mensal de vendas dos últimos 6 meses (`SUM(...)` agrupado por mês); ranking de clientes por receita para a Curva ABC (`SUM(...)` agrupado por cliente, `ORDER BY valor DESC LIMIT 10`, classificado em badges Prioridade/Atenção/Regular por percentual acumulado em `buildCurvaAbc`). `Dashboard.tsx` passou a consumir esses campos da resposta da API em vez das constantes zeradas; card "Desempenho Mensal" (dependente de "Meta", conceito não implementado em nenhuma parte do sistema) foi removido, e o card "Evolução de Venda" e "Resumo" foram redimensionados para ocupar o espaço liberado (`lg:col-span-6`→`lg:col-span-8`, `lg:col-span-3`→`lg:col-span-4`).
- **Evidências/comandos:** leitura direta do `git diff` de ambos os arquivos no working tree, confirmando remoção das constantes zeradas e adição das queries reais; smoke test manual via Safari (osascript) confirmando visualmente os widgets populados com dado real (pedido de R$ 2.999, 2 clientes, positivação de 50%) — ver os 3 achados PROB/BUG específicos abaixo; backend typecheck limpo; suíte completa do backend reportada pelo usuário como 32 suites / 183 testes sem regressão (não reexecutada por este agente, ambiente sem `node`/`npm`); frontend typecheck limpo.
- **Riscos residuais:** correção está no working tree, **sem commit** nesta sessão; suíte de testes (32/183) e typechecks não foram reexecutados por este agente — relatados pelo usuário; não existe teste automatizado dedicado a `getDashboard` cobrindo os cenários de borda encontrados no smoke test (ver BACKLOG-0017); heurísticas de cliente ativo (90 dias)/prospect/positivação (mês corrente) são regras de negócio aprovadas pelo usuário nesta sessão, não uma migration com coluna dedicada — se o critério de negócio mudar, a lógica está hardcoded nas 3 queries SQL, não configurável.
- **Próximo passo:** commit da correção (fora do escopo deste agente); adicionar cobertura de teste automatizado para `getDashboard` (ver BACKLOG-0017); considerar registrar as heurísticas de cliente ativo/prospect/positivação como regra de negócio documentada (candidato a `SYSTEM_OVERVIEW.md`) caso venham a mudar com frequência.
- **Relacionado:** BUG-0013, BUG-0014, BUG-0015, BACKLOG-0017

### Achados do smoke test manual pós-implementação (sub-itens de PROB-0055)

Os 3 achados abaixo só apareceram ao rodar o dashboard reescrito contra dado real (Postgres local, smoke test via Safari/osascript) — nenhum é reproduzível com dataset sintético mínimo, o que motivou registrá-los como sub-itens de causa raiz comum (PROB-0055: dashboard reescrito nesta sessão) em vez de problemas isolados sem contexto.

**a) `SUM(total_com_imposto)` zerava "Evolução de Venda" e "Curva ABC de Clientes" com pedido real no banco** — `total_com_imposto` é opcional em `pedidos` e o fluxo real de criação de pedido (`frontend/src/pages/PedidoForm.tsx:156`, `backend/src/orders/orders.service.ts:62`) só preenche `total_sem_imposto`; a query somava só `total_com_imposto`, sempre `NULL`. Corrigido com `SUM(COALESCE(total_com_imposto, total_sem_imposto, 0))`. Ver BUGFIX_LOG BUG-0013.

**b) Ordem da Curva ABC de Clientes invertida por `NULL` agregado** — numa primeira correção do item (a), sem o `, 0` final no `COALESCE`, cliente sem valor agregável virava `SUM(...) = NULL`, e o default `NULLS FIRST` do `ORDER BY ... DESC` do PostgreSQL colocava esse cliente antes do cliente com receita real. Corrigido coalescendo para `0` dentro do `SUM`. Ver BUGFIX_LOG BUG-0014.

**c) Gauge de "Positivação" sempre visualmente 100% preenchido** — `RadialBarChart` do Recharts sem domínio explícito escala o preenchimento pelo próprio valor plotado (único ponto de dado), sempre resultando em arco cheio independentemente do valor real. Bug pré-existente do mock original, só relevante agora que o valor passou a ser real. Corrigido com `<PolarAngleAxis type='number' domain={[0, 100]} angleAxisId={0} tick={false} />`. Ver BUGFIX_LOG BUG-0015.

---

### PROB-0056 — KPI "Faturamento" do Dashboard sempre `R$ 0`: duas fontes de verdade divergentes para "venda" na mesma tela
- **Data:** 2026-07-21
- **Origem:** teste (smoke test de regressão pós-commits, ver bullet no topo da ledger)
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend
- **Sintoma:** no card "Resumo" do Dashboard, o KPI "Faturamento" ("Vendas registradas") mostrava `R$ 0`, enquanto o gráfico "Evolução de Venda" e a tabela "Curva ABC de Clientes", na mesma tela, mostravam uma venda real de R$ 5.834,00 em julho/2026 para "Cliente Smoke Test LTDA". Confirmado por screenshot do Safari e pela resposta JSON de `GET /api/financeiro/dashboard` antes do fix: `"totalVendas":"0.00"` junto de `"vendasMensais":[...,{"mes":"2026-07","valor":"5834.00"}]` e `"curvaAbc":[{"cliente":"Cliente Smoke Test LTDA","valor":"5834.00",...}]` na mesma resposta.
- **Causa raiz:** confirmada, por leitura de código — `backend/src/finance/finance.service.ts`, método `getDashboard` (antes do fix, por volta das linhas 523-680). O KPI `totalVendas` vinha de `SUM(CASE WHEN m.tipo = 'Venda' THEN m.valor ELSE 0 END)` sobre `financeiro_movimentacao` (via `movimentoRepo`) — tabela de lançamentos financeiros **manuais** (entity `FinanceMovement`, tipos livres `'Custo Fixo' | 'Custo Rotativo' | 'Venda'`, criados só via `CreateMovementDto`/tela Financeiro). Já "Evolução de Venda" e "Curva ABC de Clientes" somam direto de `pedidos` (`SUM(COALESCE(total_com_imposto, total_sem_imposto, 0))`, excluindo `status = 'cancelado'`). Nenhum fluxo do sistema cria automaticamente um lançamento `financeiro_movimentacao` tipo `'Venda'` quando um pedido é fechado (confirmado por grep: nenhuma referência a criação de movimento tipo Venda fora do CRUD manual do módulo Financeiro) — o card "Faturamento" ficava sempre em `R$ 0` na prática, a menos que alguém lançasse manualmente uma entrada financeira duplicada do tipo Venda.
- **Impacto técnico:** o principal KPI de faturamento do dashboard operacional ficava permanentemente incorreto (zerado) em qualquer ambiente onde vendas vêm do fluxo normal de pedidos e não de lançamento financeiro manual duplicado — mesmo padrão de "painel aparentemente funcional mas com dado enganoso" já registrado em PROB-0055. Também distorcia o "Saldo" calculado no export/print do dashboard (`frontend/src/pages/Dashboard.tsx`, `saldo = faturamento - custos - comissoes`), que ficava negativo mesmo com vendas reais positivas.
- **Arquivos/módulos:** `backend/src/finance/finance.service.ts` (método `getDashboard`)
- **Solução proposta:** derivar `totalVendas` de `pedidos` (mesma fonte já usada por `vendasMensais`/`curvaAbc`), em vez de `financeiro_movimentacao`.
- **Solução aplicada:** adicionada uma nova query no mesmo `Promise.all` de `getDashboard`, somando `total_com_imposto`/`total_sem_imposto` direto de `pedidos` (mesmo padrão de `COALESCE` já usado nas queries de `vendasMensais`/`curvaAbc`, soma histórica completa sem janela de tempo, não-cancelados, filtrada por tenant): `SELECT SUM(COALESCE(total_com_imposto, total_sem_imposto, 0)) AS total FROM pedidos WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'`. O campo `totalVendas` do retorno passou a usar esse resultado em vez de `movResult.vendas`. O `SUM(CASE WHEN m.tipo = 'Venda' ...)` foi removido do `SELECT` da query em `movimentoRepo` por estar morto (não usado por mais nada no método); essa query continua alimentando `totalCustoFixo`/`totalCustoRotativo`, que já estavam corretos e não fazem parte deste bug. A tabela `financeiro_movimentacao` e o CRUD manual de lançamentos tipo 'Venda' no módulo Financeiro (fora do Dashboard) não foram alterados — continuam existindo para bookkeeping manual, só deixaram de alimentar este KPI específico do Dashboard.
- **Evidências/comandos:** antes do fix, `GET /api/financeiro/dashboard` retornava `"totalVendas":"0.00"`; depois do fix (hot-reload do `start:dev`, sem restart manual), retornou `"totalVendas":"5834.00"`, batendo com `vendasMensais`/`curvaAbc`. Confirmado visualmente por reload real da página no Safari (screenshot antes: card "Faturamento" "R$ 0"; screenshot depois: "R$ 5.834", coerente com "Evolução de Venda" ao lado). Screenshots em `/private/tmp/claude-501/-Users-Zero-Projetos-renowa/a4f2b39d-6cdb-4858-a994-05d31bed0f48/scratchpad/dashboard_smoke.png` (antes) e `dashboard_fixed.png` (depois) — arquivos de scratchpad temporário da sessão, não fazem parte do repositório.
- **Riscos residuais:** fix está no working tree, **sem commit** nesta sessão. Ambiente sem `node`/`npm` disponível neste shell — typecheck e suíte de testes do backend **não foram executados** por este agente/sessão; a mudança segue o mesmo padrão de query/`COALESCE` já usado no arquivo e não altera tipos do retorno do método, mas não foi validada por `tsc`/Jest automatizado nesta sessão. Não existe teste automatizado dedicado a `getDashboard` (gap já registrado em BACKLOG-0017). Decisão de negócio implícita nesta correção: "Faturamento" no Dashboard agora reflete pedidos reais (não-cancelados), e não mais lançamentos financeiros manuais tipo 'Venda' — se o negócio quiser que esse KPI reflita bookkeeping manual em vez de pedidos, é uma decisão de produto que precisa ser confirmada com o usuário, não assumida como definitiva (ver BACKLOG-0018).
- **Próximo passo:** commit da correção (fora do escopo deste agente); confirmar com o usuário/PO a decisão de negócio sobre a fonte de verdade do KPI "Faturamento" (BACKLOG-0018); adicionar cobertura de teste automatizado para este cenário em `getDashboard` (BACKLOG-0017).
- **Relacionado:** PROB-0055, BACKLOG-0017, BACKLOG-0018, BUG-0016

### PROB-0057 — `AutoProvisionGuard` global depende de uma tenant_role `'viewer'` pré-existente que nada no código cria; sem ela, primeiro login de usuário sem `local_user` recebe 403 antes de qualquer handler
- **Data:** 2026-07-22
- **Origem:** implementação (achado durante investigação da Etapa 4 do RBAC overhaul: remoção do bypass hardcoded de admin + fim do `RolesGuard`)
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** backend / segurança (RBAC)
- **Sintoma:** `AutoProvisionGuard` é `APP_GUARD` global (`backend/src/app.module.ts:89`, ordem: `JwtAuthGuard` → `AutoProvisionGuard` → `PermissionGuard` → `UserThrottlerGuard`), roda em toda request não-`@Public()` antes de qualquer handler de controller. Quando não existe `local_users` para `(authUserId, tenantId)` (`backend/src/common/guards/auto-provision.guard.ts:64-86`), o guard busca uma `tenant_role` chamada exatamente `'viewer'` via `findTenantRoleByName(tenantId, 'viewer')` e, se não encontrar, lança `ForbiddenException('Tenant não provisionado com role viewer')` (`:70-78`) — 403 direto do guard global, antes de qualquer lógica de handler.
- **Causa raiz:** confirmada por leitura de código — `findTenantRoleByName` (`backend/src/users/users.service.ts:167-178`) só faz `tenantRoleRepo.findOne(...)`; nada cria a role `'viewer'` automaticamente nesse caminho. O único ponto do código que efetivamente cria/garante uma tenant_role sob demanda é `ensureTenantRole`/`ensureTenantRoleWith` (`users.service.ts:43-48`, `:314+`), mas esse método só é chamado (a) dentro do handler `GET /users/me` (`users.controller.ts:48`, já depois do guard global) e (b) dentro de `createTenantUser`, o caminho de `POST /users` usado por um admin já existente para criar novo usuário (confirmado em `docs/superpowers/specs/2026-07-11-auth-nativa-fase1-design.md:116`: `ensureTenantRole` + insert de `LocalUser` dentro da mesma transação). Ou seja: se uma tenant_role `'viewer'` nunca foi criada para um tenant (por qualquer via), qualquer usuário desse tenant sem `local_user` ainda — por exemplo, o primeiro login de um usuário novo — recebe 403 do guard global antes de chegar a qualquer handler, incluindo o próprio `/users/me` que teria criado a role sob demanda.
- **Impacto técnico:** bloqueio potencial do bootstrap de qualquer tenant novo cujo processo de criação não tenha, por alguma via, criado previamente uma tenant_role `'viewer'`. Não existe rota de signup/registro de tenant neste backend — `backend/src/auth/auth.controller.ts` só expõe `login` (`:36`), `refresh` (`:45`), `logout` (`:53`), `change-password` (`:62`), `mobile-session` (`:69`), `me` (`:83`) e `DELETE mobile-session/:uuid` (`:103`); nenhum endpoint cria tenant ou primeiro usuário. `docs/superpowers/specs/2026-07-11-auth-nativa-fase1-design.md:12` confirma a intenção de design: "Sistema interno: não há cadastro público — usuários só são criados por admin, dentro do sistema. O primeiro admin é inserido manualmente no banco." Isso é consistente com o guard ser descrito como "rede de segurança" (`design.md:129`: "`AutoProvisionGuard` mantido... provisiona `LocalUser` por `authUserId = sub` como rede de segurança; o caminho normal (`POST /users`) já cria o `LocalUser`"), presumindo que o processo manual/externo de bootstrap do primeiro admin sempre cria `usuarios` + `local_users` + a tenant_role usada juntos. **Não verificado neste registro:** se esse processo manual/externo (ops/script/ferramenta interna, fora deste repo) de fato sempre provisiona uma tenant_role `'viewer'` (ou o próprio admin) antes do primeiro login — não há evidência no repo desse processo, então a severidade real depende de uma prática operacional que este agente não tem como confirmar.
- **Arquivos/módulos:** `backend/src/common/guards/auto-provision.guard.ts:64-86`; `backend/src/app.module.ts:89` (registro global via `APP_GUARD`); `backend/src/users/users.service.ts:43-48,167-178,314+` (`ensureTenantRole`/`ensureTenantRoleWith` vs. `findTenantRoleByName`); `backend/src/users/users.controller.ts:48` (`GET /users/me`, provisiona role mas roda depois do guard); `backend/src/auth/auth.controller.ts` (ausência de rota de signup/tenant); `docs/superpowers/specs/2026-07-11-auth-nativa-fase1-design.md:12,116,129` (intenção de design documentada). Nota lateral não verificada: `backend/src/common/types/jwt-payload.type.ts:2` mantém comentário legado ("uuid do usuário no ZonaDevAuth") que parece resquício da arquitetura anterior (JWKS/ZonaDevAuth), já removida segundo o mesmo doc de design (linha ~7: "OIDC/ZonaDev/JWKS/AuthApiService removidos") — comentário desatualizado, não confirmado como causando efeito funcional.
- **Solução proposta (não aplicada — fora de escopo desta etapa; delegar a `backend-engineer`):** avaliar uma das opções: (a) `findTenantRoleByName` (ou o próprio guard) passar a usar `ensureTenantRole`/`ensureTenantRoleWith` para garantir a existência da role `'viewer'` sob demanda, mesmo padrão já usado em `/users/me` e `createTenantUser`; (b) documentar e garantir, no processo de bootstrap externo de tenant (fora deste repo), que a criação de um tenant novo sempre inclui a tenant_role `'viewer'` (e idealmente `admin`/`manager`) antes de qualquer login; (c) adicionar teste de integração cobrindo "tenant novo, zero tenant_roles, primeiro login" para expor o comportamento atual e travar a decisão tomada. Qualquer uma dessas mudanças é código de aplicação — fora da permissão deste agente (`docs-reporter`).
- **Solução aplicada:** nenhuma. Apenas registrado; decisão explícita de não corrigir agora por estar fora do escopo da Etapa 4 do RBAC overhaul e por baixa confiança sobre o processo real de bootstrap de tenant fora deste repo.
- **Evidências/comandos:** leitura direta de `auto-provision.guard.ts`, `users.service.ts`, `app.module.ts`, `auth.controller.ts`, `users.controller.ts`, `jwt-payload.type.ts` e `docs/superpowers/specs/2026-07-11-auth-nativa-fase1-design.md` (linhas 1-20, 115-138); `grep -n "APP_GUARD\|AutoProvisionGuard\|RolesGuard" backend/src/app.module.ts` confirma ordem dos 4 guards globais; `grep -n "@Get\|@Post\|@Patch\|@Delete" backend/src/auth/auth.controller.ts` confirma ausência de rota de signup/registro de tenant.
- **Riscos residuais:** severidade real incerta — depende de um processo operacional de bootstrap de tenant que existe fora deste repositório (ops/script/ferramenta interna) e que este agente não tem como inspecionar ou confirmar. Se esse processo já cria a tenant_role `'viewer'` (ou o `local_user` do admin diretamente) antes do primeiro login, o bloqueio nunca se manifesta na prática; se não cria, qualquer tenant novo fica travado no primeiro login de qualquer usuário sem `local_user`, incluindo o próprio primeiro admin. Comentário legado em `jwt-payload.type.ts:2` (referência a ZonaDevAuth) não avaliado quanto a efeito funcional, só sinalizado como possível resquício de documentação/comentário desatualizado.
- **Próximo passo:** delegar avaliação e decisão de correção ao `backend-engineer` (opções (a)/(b)/(c) acima); confirmar com o time/usuário qual é o processo real de bootstrap de tenant novo hoje (fora deste repo) antes de decidir a correção definitiva; se confirmado que o bloqueio é real, tratar como candidato a entrada em `docs/BACKLOG.md` na próxima passagem do `docs-reporter`.
- **Relacionado:** Etapas 1-4 do RBAC overhaul (catálogo de permissões, migration+backfill do admin, provisionamento explícito de tenant_roles, remoção do bypass hardcoded de admin + fim do `RolesGuard`)

---

## Overhaul de RBAC (6 etapas) — 2026-07-22

Origem: implementação, em 6 etapas commitadas em sequência em `master` (`e24a1cf` → `cc6c400` → `7e37c8b` → `aed3c37` → `5553779` → etapa 6 ainda não commitada no momento deste registro). Objetivo: eliminar o bypass hardcoded `role.name === 'admin'` do `PermissionGuard`/`sync-authorization.service.ts`/`auth.controller.ts` sem quebrar admins existentes, e concluir a reconciliação que PROB-0043 havia deixado explicitamente fora de escopo (`AuditController`/`PrivacyController` em `RolesGuard`+`@Roles('ADMIN')`). Verificação deste registro: leitura direta do código atual (`permission.guard.ts`, `sync-authorization.service.ts`, `auth.controller.ts`, `audit.controller.ts`, `privacy.controller.ts`, `roles.service.ts`, `roles.module.ts`, `shared/src/permissions/catalog.ts`, migration `0025_permission_catalog_and_system_role.sql`, `RolesPage.tsx`), não apenas o resumo do implementador. Testes/E2E abaixo são os reportados pelo implementador desta sessão; **não foram reexecutados por este agente** (fora de escopo de `docs-reporter`).

### PROB-0058 — Bypass hardcoded de admin no RBAC eliminado; catálogo único de permissões introduzido; `AuditController`/`PrivacyController` migrados de `RolesGuard` para `PermissionGuard` (fecha a pendência deixada por PROB-0043)
- **Data:** 2026-07-22
- **Origem:** implementação (6 etapas)
- **Severidade:** HIGH
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend / frontend / segurança
- **Sintoma (estado anterior às 6 etapas):** `role.name === 'admin'` concedia acesso total via bypass hardcoded em 3 lugares (`PermissionGuard`, `sync-authorization.service.ts`, `auth.controller.ts` `/auth/me`); o catálogo de permissões só existia implicitamente no banco (sem fonte única de verdade tipada); `ensureTenantRole`/`ensureTenantRoleWith` (auto-provisionamento de `tenant_roles`, disparado no primeiro `/users/me` ou na criação de usuário nativo) criava roles sem nenhuma permissão associada; `AuditController` e `PrivacyController` usavam `RolesGuard`+`@Roles('ADMIN')` em vez do `PermissionGuard` granular — PROB-0043 já havia identificado isso e deixado **explicitamente fora de escopo** ("fora de escopo — usam só `'ADMIN'`, confirmado por leitura direta desses dois arquivos").
- **Causa raiz:** confirmada — bypass de conveniência introduzido antes de existir um catálogo de permissões tipado; nunca removido depois que a tela "Perfis de acesso" passou a gerenciar permissões granulares por `tenant_role_permissions`, deixando o próprio conceito de permissão granular inoperante para o papel `admin` (sempre passava por bypass, nunca era de fato checado).
- **Impacto técnico (antes):** qualquer alteração de permissão granular do perfil `admin` pela tela "Perfis de acesso" era inconsequente — o bypass ignorava a checagem granular. `AuditController`/`PrivacyController` ficavam presos ao vocabulário estático `'ADMIN'` (mesma classe de problema de PROB-0043), inacessíveis a qualquer papel não-admin mesmo que devesse ter acesso a auditoria/privacidade por permissão concedida explicitamente.
- **Arquivos/módulos:**
  - `shared/src/permissions/catalog.ts` (novo workspace `shared/`, `@renowa/shared`) — `PermissionSlug` (enum, 25 valores confirmados por leitura: 4 CRUD × 5 módulos de negócio + `financeiro.ver`/`financeiro.editar` + `usuarios.gerenciar` + `auditoria.ver` + `privacidade.gerenciar`), `PermissionModule`, `PERMISSION_CATALOG`, `PERMISSION_SLUGS`, `DEFAULT_ROLE_PERMISSIONS` (`admin`/`gestao` = catálogo inteiro, `vendedor`/`financeiro` = subconjuntos confirmados por leitura), `SYSTEM_ROLE_NAMES = ['admin']`.
  - `backend/src/database/migrations/0025_permission_catalog_and_system_role.sql` — insere os 2 slugs novos (`auditoria.ver`, `privacidade.gerenciar`) em `permissions`; adiciona `tenant_roles.is_system boolean NOT NULL DEFAULT false` com backfill `true` para roles `admin` existentes; concede as 25 permissões do catálogo a cada role `is_system` em `tenant_role_permissions` (backfill crítico pré-requisito da remoção do bypass); troca `UNIQUE(tenant_id, name)` cheio por índice parcial `WHERE deleted_at IS NULL` (corrige unique violation ao recriar role com mesmo nome após soft-delete). Comentários no próprio arquivo confirmam a intenção declarada de cada trecho.
  - `backend/src/users/users.service.ts` (`ensureTenantRole`/`ensureTenantRoleWith`) — passam a setar `is_system` e conceder `DEFAULT_ROLE_PERMISSIONS` na mesma transação da criação da role; nomes fora do template ficam sem permissão (fail-closed).
  - `backend/src/common/guards/permission.guard.ts` — bypass `role.name === 'admin'` removido; confirmado por leitura direta (linha 35: só resta `if (req.user?.roles?.includes('SUPERADMIN')) return true;`).
  - `backend/src/sync/sync-authorization.service.ts:21` — mesmo padrão, confirmado: só resta `if (user.roles?.includes('SUPERADMIN')) return;`.
  - `backend/src/auth/auth.controller.ts:90` — bypass de admin removido de `/auth/me`; bypass de `SUPERADMIN` mantido intacto (conceito de plataforma cross-tenant, ortogonal ao RBAC por tenant).
  - `backend/src/common/guards/roles.guard.ts`, `roles.guard.spec.ts`, `backend/src/common/decorators/roles.decorator.ts` — confirmado que **não existem mais** (`ls backend/src/common/guards/` e `backend/src/common/decorators/` não os lista); `grep -rn "RolesGuard\|@Roles(" backend/src --include="*.ts"` retorna vazio em todo o backend.
  - `backend/src/audit/audit.controller.ts` — confirmado: `@Controller('admin/audit')` + `@RequirePermission('auditoria.ver')`, sem `RolesGuard`.
  - `backend/src/privacy/privacy.controller.ts` — confirmado: `@Controller('admin/privacy/requests')` + `@RequirePermission('privacidade.gerenciar')`, sem `RolesGuard`.
  - `backend/src/roles/roles.controller.ts` (`GET /permissions`, antes sem guard nenhum) — ganhou `@RequirePermission('usuarios.gerenciar')`.
  - `backend/src/roles/roles.service.ts` — `updateRole` recusa rename de role `is_system` com `ForbiddenException('Role de sistema não pode ser renomeada')` (linha 184); `deleteRole` recusa exclusão com `ForbiddenException('Role de sistema não pode ser excluída')` (linha 226); `updateRolePermissions` recusa edição de permissões com `ForbiddenException('Permissões de uma role de sistema não podem ser editadas')` (linha 257) — todas confirmadas por leitura direta.
  - `backend/src/roles/dto/create-role.dto.ts` (`permissions?: string[]`) — `createRole` grava role + permissões na mesma transação (`roles.service.ts:127-142`, confirmado por leitura), fechando o gap de "2 requests" anterior.
  - `backend/src/roles/roles.service.ts` (Etapa 6, commit `396f3337`) — `AuditService` injetado via `RolesModule` importando `AuditModule` (confirmado em `roles.module.ts:8,17`); `createRole`/`updateRole`/`deleteRole`/`updateRolePermissions` recebem `actor?: RequestUser` (passado pelo `RolesController` via `@CurrentUser()`, confirmado nas 4 chamadas do controller) e registram evento `pii_audit_events` (`resourceType: 'tenant_role'`, ações CREATE/UPDATE/DELETE) quando o actor é informado — fecha um gap real: mudança de perfil/permissão não deixava rastro nenhum, diferente de `UsersService` que já auditava usuário.
  - `frontend/src/pages/configuracoes/RolesPage.tsx` — modal de criação com checklist de permissões; badge "Sistema" e ações desabilitadas para role `is_system`; confirmado por leitura que **não existe** UI de rename para role existente (só "Novo perfil de acesso" e "Permissões de `<nome>`") — ver BACKLOG-0020.
  - `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/pages/configuracoes/ConfiguracoesHome.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/errors.ts` — `isAdmin()` trocado por `hasPermission()` por seção; rota pai `/configuracoes` perdeu `adminOnly`; `getApiErrorMessage` passa a mostrar mensagem real do backend em 400/403 (não verificado neste registro linha a linha — checar se necessário numa auditoria futura).
- **Solução aplicada:** ver lista de arquivos/módulos acima — bypass eliminado com backfill prévio seguro (migration antes da remoção de código, ordem confirmada pela sequência de commits); catálogo único tipado em `shared/`; provisionamento fail-closed; `AuditController`/`PrivacyController` migrados para `PermissionGuard` (fecha a pendência de PROB-0043); auditoria de mudança de perfil/permissão adicionada.
- **Evidências/comandos (reportadas pelo implementador, não reexecutadas por este agente):** suíte backend completa 35 suites / 201 testes sem regressão (baseline documentado antes do overhaul era 32/183 — diferença são testes novos adicionados a cada etapa); build frontend limpo (`tsc -b && vite build`); suíte vitest frontend 10/10; testado contra Postgres real (`renowa-dev-postgres`) — migration 0025 aplicada e idempotente, backfill do admin conferido (25/25 permissões), índice parcial testado com soft-delete+recriação em transação com `ROLLBACK`, proteção `is_system` testada contra admin real (rename/delete/editar-permissões recusados), criação atômica testada, 3 eventos de auditoria gravados em `pii_audit_events` para create/update/delete de role de teste; E2E via curl contra backend real — admin (`admin@renowa.local`) acessa tudo, vendedora (`vendedora@renowa.local`) recebe 403 puro em `/roles`, `/permissions`, `/admin/audit`, `/admin/privacy/requests`. **Verificação direta deste agente** (comandos executados nesta sessão): leitura de `permission.guard.ts` (sem bypass admin), `grep` confirmando ausência de `RolesGuard`/`roles.guard.ts`/`roles.decorator.ts` em todo o backend, leitura de `audit.controller.ts`/`privacy.controller.ts` (`@RequirePermission`), leitura de `roles.service.ts` (injeção de `AuditService`, 3 `ForbiddenException` de proteção `is_system`, 4 chamadas de `audit.record`), leitura de `shared/src/permissions/catalog.ts` (25 slugs, `DEFAULT_ROLE_PERMISSIONS`, `SYSTEM_ROLE_NAMES`) e da migration `0025_permission_catalog_and_system_role.sql` (comentários confirmam a intenção descrita).
- **Riscos residuais:** (1) nenhuma verificação visual em navegador desta rodada (`claude-in-chrome` indisponível no ambiente do implementador) — UI validada só por build/tipo/teste unitário, não por captura de tela real, diferente do padrão de PROB-0042/0043/0044/0045/0046 que tiveram clique-through real confirmado; (2) Etapa 6 (auditoria de `roles.service.ts`) commitada em `396f3337` após este registro ter sido escrito — status atualizado nesta mesma edição; (3) `RolesPage.tsx` não tem UI de rename mesmo o backend suportando (ver BACKLOG-0020, pré-existente, não introduzido por este overhaul); (4) `frontend/src/lib/errors.ts` não foi lido linha a linha por este agente — a mudança de 400/403 mostrando mensagem real do backend não foi verificada diretamente, só reportada pelo implementador; (5) PROB-0057 (`AutoProvisionGuard` exige tenant_role `'viewer'` pré-existente) é um achado colateral desta mesma investigação, permanece **ABERTO** e **não é resolvido nem afetado por este registro** — não confundir os dois.
- **Próximo passo:** considerar smoke visual real em navegador antes do próximo deploy, dado que PROB-0042/0043/0044 anteriores só foram considerados definitivamente fechados após clique-through real; avaliar BACKLOG-0020 (rename de perfil) quando priorizado.
- **Relacionado:** PROB-0042 (guard ausente em `RolesController`, já FECHADO — este overhaul aprofunda o mesmo controller com `is_system`/auditoria), PROB-0043 (fecha a pendência de `AuditController`/`PrivacyController` que aquele registro deixou fora de escopo), PROB-0034 (já FECHADO — modelo único `tenant_role_permissions` é pré-requisito deste overhaul), PROB-0057 (achado colateral da mesma investigação, ABERTO, tratado à parte), BACKLOG-0020

---

## Implementação "Fluxo Comercial Completo" (pedidos → faturamento → comissão → caixa) — 2026-07-22

Origem: implementação de grande porte, plano aprovado em `/Users/Zero/.claude/plans/fluxo-comercial-completo-buzzing-seal.md`. Todas as fases concluídas e testadas (backend 236 testes, frontend 29 testes, lint/build limpos em ambos). Ver relatório consolidado em [REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md](REVIEW_REPORTS/2026-07-22_fullstack_implementation_fluxo-comercial-completo.md) para o inventário completo de arquivos/módulos tocados. Os 2 problemas abaixo são achados de risco estrutural/drift descobertos durante essa implementação, não bugs da feature em si.

### PROB-0059 — `synchronize:true` do TypeORM ativo em dev, coexistindo com migrations SQL como fonte de verdade — já causou drop silencioso de 4 invariantes recém-criadas
- **Data:** 2026-07-22
- **Origem:** implementação (achado incidental durante a Fase 2/3 do "Fluxo Comercial Completo")
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** backend / banco / infra
- **Sintoma:** durante a implementação, com um processo `nest start --watch` rodando em background ininterruptamente, 4 invariantes recém-criadas por migration SQL desapareceram silenciosamente do Postgres de dev assim que as entities TypeORM correspondentes foram editadas: a constraint `pedidos_status_check` (criada pela migration `0027_order_status_lifecycle.sql`), a constraint `comissoes_status_check` e os 2 índices únicos parciais `WHERE ... IS NULL` de `notas_fiscais` (migration `0028_notas_fiscais.sql`) e `comissoes` (migration `0029_commission_pedido_nota_link.sql`). Nenhum erro foi lançado — a aplicação continuou funcionando normalmente sem essas proteções.
- **Causa raiz:** confirmada — `backend/src/app.module.ts:44-46` mantém `synchronize: config.get('DB_SYNC') === 'true' || config.get('NODE_ENV') !== 'production'`, ou seja, `synchronize: true` sempre que `NODE_ENV !== 'production'` (todo ambiente de dev, sem precisar de `DB_SYNC`). TypeORM `synchronize` compara o schema real do banco contra os decorators das entities e ajusta o banco para "bater" com as entities — inclusive removendo o que considera "extra". `CHECK` constraints (`pedidos_status_check`, `comissoes_status_check`) e índices únicos parciais (`WHERE deleted_at IS NULL AND ...`) não têm decorator equivalente em TypeORM (`@Check`/`@Index` não expressam `CHECK (status IN (...))` nem `WHERE` parcial da forma como essas migrations os criaram via SQL cru), então o `synchronize` os interpretou como divergência e os removeu na primeira sincronização após a entity ser salva/recompilada pelo watch.
- **Impacto técnico:** qualquer invariante de banco criada via migration SQL que não tenha equivalente exato em decorator TypeORM (CHECK constraints, índices parciais, alguns tipos de FK composta) está em risco de ser removida silenciosamente em ambiente de dev sempre que uma entity for editada com o processo `watch` ativo — sem erro visível, sem log de alerta, só detectável reconferindo o catálogo do Postgres manualmente. Neste caso as 4 invariantes foram reaplicadas manualmente e confirmadas presentes no banco de dev no momento deste registro, mas o mecanismo que as removeu continua ativo.
- **Arquivos/módulos:** `backend/src/app.module.ts:44-46` (`synchronize`); `backend/src/database/migrations/0027_order_status_lifecycle.sql` (`pedidos_status_check`); `backend/src/database/migrations/0028_notas_fiscais.sql` (índice único parcial de `notas_fiscais`); `backend/src/database/migrations/0029_commission_pedido_nota_link.sql` (`comissoes_status_check` + índice único parcial de `comissoes`)
- **Solução proposta:** avaliar com `software-architect`/`database-engineer` uma das opções — (a) desligar `synchronize` também em dev, já que migrations SQL são a fonte de verdade declarada do projeto (BACKLOG-0004 já reescreveu as migrations pensando nisso), passando dev a depender só do migration runner; (b) manter `synchronize:true` em dev por conveniência de desenvolvimento, mas documentar como risco operacional conhecido e formalizar um passo de checklist pós-migration ("reconferir constraints/índices únicos parciais no catálogo do Postgres sempre que um processo `watch`/`synchronize` esteve ativo durante ou após aplicar uma migration"); (c) migrar as invariantes hoje só em SQL para uma combinação de decorator (`@Check`, `@Index` com `where`) onde o TypeORM suportar, reduzindo a superfície de divergência.
- **Solução aplicada:** ver bloco "ATUALIZAÇÃO 2026-07-22 (parte 3)" abaixo. (Registro original: nenhuma solução — as 4 invariantes foram reaplicadas manualmente durante a implementação e confirmadas presentes no banco naquele momento.)
- **Evidências/comandos:** relato direto do implementador da feature (agente que executou o "Fluxo Comercial Completo"), não reverificado de forma independente naquele registro; leitura de `backend/src/app.module.ts:42-46` confirma a condição do `synchronize`.
- **Riscos residuais:** ver bloco de atualização abaixo.
- **Próximo passo:** ver bloco de atualização abaixo.
- **Relacionado:** PROB-0060, PROB-0061, PROB-0004, BACKLOG-0004, BACKLOG-0039, BACKLOG-0041, BUG-0019, BUG-0020, BUG-0021

#### ATUALIZAÇÃO 2026-07-22 (parte 3) — reincidência confirmada, escopo real muito maior, e resolvido em dev

- **Status revisado:** ABERTO → **FECHADO_COM_RESSALVA**. (Mecanismo desligado + invariantes restauradas + detector de drift criado. **A ressalva é única e explícita: produção não foi verificada nesta sessão.**)
- **Reincidência confirmada — verificado diretamente por query no `renowa-dev-postgres` nesta sessão:** as 4 invariantes tinham sumido **de novo**; as duas queries do ledger retornaram `(0 rows)`. Processo `nest start --watch` PID 13091 estava rodando desde 12:14, com `NODE_ENV=development` e `app.module.ts:44-46` em `synchronize: true`.
- **Correção factual de escopo (verificado por query própria):** o registro original subestimou o dano. Não eram 4 objetos — havia **zero CHECK constraints em todo o schema `public`**, enquanto as migrations declaram ~20. Além das 2 já registradas, também tinham sido apagadas:
  - `version > 0` em `pedidos`, `financeiro_movimentacao`, `comissoes`, `parceiros_comerciais`, `inadimplencia` (migration `0007`) e em `notas_fiscais` (`0028`) — **base do controle de concorrência otimista**;
  - `version > 0` da migration `0009` (`clientes`, `produtos`, `fornecedores`, `transportadoras`, `itens_pedido`);
  - `itens_pedido_desconto_perc_range` e `itens_pedido_ipi_perc_range` (`0024`);
  - `access_token_version > 0` (`0023`);
  - enums de `lgpd_requests` (`subject_type`, `request_type`, `status`) e `action` de `pii_audit_events` (`0010`/`0011`);
  - o índice único parcial `uq_lgpd_active_request` (`0011`).
- **ARMADILHA NOVA — ninguém deve "só rodar a migration de novo" (verificado):** o `synchronize` **renomeou** as FKs compostas das migrations `0028`/`0029` (ex.: `fk_notas_fiscais_tenant_pedido` → `FK_183ff04740a6e9633d5f305ef32`). As FKs **existem** e mantêm o par `(tenant_id, ...)` — o isolamento multi-tenant foi preservado — mas os blocos `DO $$ IF NOT EXISTS (conname = 'fk_...')` das migrations `0028`/`0029` **perderam idempotência contra esse banco**: reexecutar aqueles arquivos criaria FK duplicada em vez de no-op.
- **Correções aplicadas nesta sessão:**
  1. Processo `nest start --watch` (PID 13091) encerrado.
  2. `backend/src/app.module.ts` — `synchronize` passou de `DB_SYNC === 'true' || NODE_ENV !== 'production'` para **`DB_SYNC === 'true'` apenas**; comentário no código explica por que nunca reativar por `NODE_ENV`. Migrations SQL passam a ser fonte de verdade em **todo** ambiente. `DB_SYNC` não está setado em nenhum `.env` nem compose. Ver BUG-0019.
  3. Nova migration `backend/src/database/migrations/0031_restore_schema_invariants.sql` — aditiva e **idempotente por design** (guardas em `pg_constraint`/`pg_indexes`/`pg_trigger`), para poder rodar também em produção sem falhar nem duplicar. Testada duas vezes em transação com `ROLLBACK` antes de valer; a segunda passada é no-op. Ver BUG-0020.
  4. Novo `backend/src/database/verify-schema.ts` + scripts `db:verify` e `db:migrate` em `backend/package.json`. Ver BUG-0021.
- **Descoberta lateral (verificada):** **não existia script de migration nenhum** no projeto — o runner só era chamado no boot em produção (`backend/src/main.ts:13`). O `db:verify` compara **por estrutura, não por nome** (porque o `synchronize` renomeia índice para `IDX_<hash>`), é read-only, parametrizado por `DATABASE_URL`, e sai com código 0/1/2.
- **Estado do banco de dev depois — verificado por query própria nesta sessão:** `checks=20` (era 0); as 2 constraints originais do PROB-0059 presentes; os 2 índices parciais presentes; `trg_set_updated_at` em 17 tabelas (+ `trg_notas_fiscais_updated_at`, que mantém nome próprio = 18 triggers); `fk_notas=1` e `fk_comissoes=4` — **sem duplicação**, a armadilha acima foi evitada.
- **Duas decisões de projeto do `database-engineer` registradas deliberadamente:** (a) as 4 constraints que nasceram `NOT VALID` **continuam `NOT VALID`** — promover a validado varre a tabela inteira e, como `runMigrations()` roda antes do `NestFactory`, uma linha histórica suja viraria falha de boot; é decisão separada, com janela própria; (b) o guard do trigger é **por função, não por nome**, senão o bloco da migration `0020` renomearia `trg_notas_fiscais_updated_at`, que é legítimo.
- **Riscos residuais:** (1) **produção não foi verificada** — não se sabe se as invariantes existem lá; o `db:verify` precisa rodar contra produção antes do deploy (BACKLOG-0041); (2) as constraints `NOT VALID` seguem sem validação de dado histórico; (3) com `synchronize` desligado em dev, provisionar banco vazio passa a depender do migration runner, que tem problema conhecido (BACKLOG-0039); (4) nada disso foi commitado.
- **Próximo passo:** rodar `db:verify` contra produção antes do deploy (BACKLOG-0041); commitar o working tree.

### PROB-0060 — Drift pré-existente: triggers `set_updated_at` da migration `0020` ausentes no Postgres de dev; `updated_at` não é atualizado em UPDATE nas tabelas antigas
- **Data:** 2026-07-22
- **Origem:** implementação (achado incidental, não relacionado ao "Fluxo Comercial Completo"; descoberto ao investigar o mecanismo de PROB-0059)
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** banco
- **Sintoma:** a migration `0020_utc_timestamps_db_authority.sql` está registrada em `schema_migrations` como aplicada (checksum correto, `applied_at` real), mas a função `public.set_updated_at()` e os triggers `trg_set_updated_at` que ela deveria criar em cada tabela **não existem** hoje no Postgres de dev — confirmado que nenhuma tabela mais antiga (`clientes`, `fornecedores`, `pedidos`, `comissoes`, `tenant_roles`, etc.) tem esse trigger. Na prática, `updated_at` dessas tabelas só é setado no `INSERT` (`DEFAULT now()`) e nunca é atualizado em `UPDATE`.
- **Causa raiz:** provável (não confirmada) — mesmo mecanismo de PROB-0059 (`synchronize:true` em dev): a função `public.set_updated_at()` e os triggers `trg_set_updated_at` são objetos de banco sem equivalente em decorator TypeORM, então o `synchronize` pode tê-los removido em algum momento histórico, da mesma forma que removeu as 4 invariantes de PROB-0059. Não verificado neste registro se essa é de fato a causa (nenhum log histórico de quando o drift começou foi inspecionado).
- **Impacto técnico:** `updated_at` não é confiável como "última modificação" em nenhuma das tabelas afetadas em dev — qualquer lógica que dependa desse campo para ordenação, cursor de sync ou auditoria de "quando foi a última mudança" está lendo um valor congelado no momento do INSERT, não da última alteração real.
- **Arquivos/módulos:** `backend/src/database/migrations/0020_utc_timestamps_db_authority.sql:31` (`CREATE OR REPLACE FUNCTION public.set_updated_at()`), `:74` (`CREATE TRIGGER trg_set_updated_at ... EXECUTE FUNCTION public.set_updated_at()`)
- **Solução proposta:** (1) investigar se esse mesmo drift existe em staging/produção, onde `synchronize` é `false` — se confirmado que existe **só em dev**, não é urgente (efeito é só no ambiente local); se existir também em produção, é um achado sério de integridade de dado (`updated_at` não confiável em dado real de negócio) e precisa de correção priorizada (reaplicar a função+triggers da migration `0020` e auditar todo uso de `updated_at` em regras de negócio/relatórios); (2) independente do ambiente, reaplicar a função e os triggers em dev para manter paridade com o que a migration `0020` pretendia.
- **Solução aplicada:** ver bloco de atualização abaixo. (Registro original: nenhuma.)
- **Evidências/comandos:** relato direto do implementador da feature, não reverificado naquele registro; leitura de `backend/src/database/migrations/0020_utc_timestamps_db_authority.sql` confirma que a migration declara a criação da função e do trigger (linhas 31 e 74).
- **Riscos residuais:** ver bloco de atualização abaixo.
- **Próximo passo:** ver bloco de atualização abaixo.
- **Relacionado:** PROB-0059, PROB-0061, BUG-0020, BACKLOG-0041

#### ATUALIZAÇÃO 2026-07-22 (parte 3) — diagnóstico corrigido e resolvido em dev

- **Status revisado:** ABERTO → **FECHADO_COM_RESSALVA** (corrigido em dev; **produção não verificada**).
- **Correção factual ao diagnóstico original:** a função `public.set_updated_at()` **existe** — a migration `0028_notas_fiscais.sql` a recriou com `CREATE OR REPLACE`. O registro original afirmava que a função estava ausente; estava errado. Faltavam **só os triggers**.
- **Solução aplicada:** triggers restaurados pela migration `0031_restore_schema_invariants.sql` (ver BUG-0020). Estado do banco de dev depois, verificado por query própria: `trg_set_updated_at` em 17 tabelas, mais `trg_notas_fiscais_updated_at` (nome próprio, legítimo) = 18 triggers.
- **Riscos residuais:** **produção não foi verificada** — se os triggers estiverem ausentes lá, `updated_at` de dado real de negócio está congelado no INSERT desde algum momento histórico não determinado, e a `0031` corrige o comportamento futuro mas **não recupera** os `updated_at` já perdidos. Nada disso está verificado.
- **Próximo passo:** rodar `db:verify` contra produção antes do deploy (BACKLOG-0041); se os triggers estiverem ausentes lá, avaliar separadamente se `updated_at` foi usado para alguma decisão de negócio, cursor de sync ou relatório.

### PROB-0061 — Infra de sync das migrations `0008`/`0009` não existe no banco de dev, apesar de ambas constarem como aplicadas em `schema_migrations`
- **Data:** 2026-07-22
- **Origem:** revisão (achado próprio ao verificar o estado do banco durante a investigação de PROB-0059)
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** banco / backend / infra
- **Sintoma:** verificado por query própria no `renowa-dev-postgres` — `sync_outbox`, `sync_changes` e `sync_mutation_inbox` = **0 tabelas**; `capture_sync_outbox` e `drain_sync_outbox` = **0 funções**; `sync_change_revision_seq` = **0**. Ainda assim, `schema_migrations` tem `0008_sync_change_feed.sql` e `0009_sync_push_v2.sql` registradas como aplicadas em 2026-07-22 14:07:57.
- **Causa raiz:** provável — **`schema_migrations` foi populada sem que o SQL correspondente tenha rodado**. As duas alternativas foram descartadas por verificação direta: (a) **não é o mecanismo do PROB-0059** — não existe nenhuma `@Entity` para essas tabelas (`grep @Entity backend/src/sync/` retorna vazio) e o `synchronize` do TypeORM só mexe em tabelas presentes nos seus metadados, nunca dropa tabela que desconhece; (b) as migrations `0008`/`0009` usam `CREATE TABLE IF NOT EXISTS` — se tivessem executado, as tabelas existiriam. Isso bate com a nota já existente no BACKLOG sobre "sanear o baseline de `schema_migrations` no banco dev legado" e tem a **mesma assinatura do PROB-0060** (migration registrada, objetos ausentes), o que sugere **causa comum, não coincidência**. Candidato à causa raiz mecânica: BACKLOG-0035 (`0007_optimistic_concurrency.sql` tem `BEGIN;`/`COMMIT;` próprios dentro da transação do runner).
- **Impacto técnico:** `backend/src/sync/sync.service.ts` depende dessas tabelas em SQL cru (`:72`, `:99`, `:498`, `:504`, `:512`) — **em dev, push/pull do mobile está quebrado**. Em produção o estado é **desconhecido e não verificado**; precisa ser checado antes do deploy (`db:verify` contra produção). **Não registrar como falha em produção — isso não está verificado.**
- **Consequência transversal (registrar com destaque):** **`schema_migrations` não é evidência confiável do que existe no banco, em nenhum ambiente.** Toda auditoria futura de schema deve inspecionar o catálogo do Postgres, não a tabela de controle.
- **Arquivos/módulos:** `backend/src/database/migrations/0008_sync_change_feed.sql`, `backend/src/database/migrations/0009_sync_push_v2.sql`, `backend/src/sync/sync.service.ts:72`, `:99`, `:498`, `:504`, `:512`
- **Solução proposta:** reexecutar `0008`/`0009` contra o banco de dev (são `IF NOT EXISTS`, portanto seguras); antes disso, decidir explicitamente sobre a mudança de comportamento embutida (ver abaixo). Em paralelo, rodar `db:verify` contra produção antes do deploy e sanear o baseline de `schema_migrations` (BACKLOG-0039/BACKLOG-0035).
- **Solução aplicada:** nenhuma. **Não restaurado nesta sessão por decisão deliberada:** restaurar religa trigger de escrita em 6 tabelas quentes (`clientes`, `produtos`, `fornecedores`, `transportadoras`, `pedidos`, `itens_pedido`) — é **mudança de comportamento, não reparo de invariante** — e aguarda decisão do usuário.
- **Evidências/comandos:** queries próprias no `renowa-dev-postgres` (contagem de tabelas/funções/sequences no catálogo + leitura de `schema_migrations`); `grep @Entity backend/src/sync/` sem resultado; leitura dos arquivos `0008`/`0009` confirmando `CREATE TABLE IF NOT EXISTS`.
- **Riscos residuais:** enquanto ABERTO, o sync mobile em dev não funciona e nenhum teste de sync exercita o caminho real; o estado de produção segue desconhecido.
- **Próximo passo:** decisão do usuário sobre religar os triggers de outbox em dev; independentemente disso, `db:verify` contra produção antes do deploy (BACKLOG-0041). Dono: `database-engineer` (+ `backend-engineer` para o impacto em `sync.service.ts`).
- **Relacionado:** PROB-0059, PROB-0060, BACKLOG-0035, BACKLOG-0039, BACKLOG-0041

### PROB-0062 — `status` de pedido gravável via POST/PUT, contornando por completo a permissão `pedidos.liberar` criada por este mesmo commit
- **Data:** 2026-07-22
- **Origem:** revisão (achado independentemente pelo `quality-reviewer` e pelo `security-auditor`, **confirmado por leitura direta do código nesta sessão**)
- **Severidade:** BLOCKER
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend / segurança / frontend
- **Sintoma:** `backend/src/orders/dto/create-order.dto.ts:41` tinha `@IsOptional() @IsString() status?: string`, e `orders.service.ts:131` (create) e `:203` (update) faziam `status: dto.status ?? 'em_aberto'`. Um usuário com a role padrão `vendedor` (que tem `pedidos.criar`/`pedidos.editar` e **não** tem `pedidos.liberar`) mandava `{"status":"liberado"}` no POST ou no PUT e contornava o endpoint dedicado criado por este mesmo commit — **a permissão nova era decorativa**.
- **Causa raiz:** confirmada — campo de máquina de estados exposto no DTO de entrada. `PATCH /:uuid/status` tinha sido corretamente travado em `cancelado`, mas POST e PUT ficaram abertos. A constraint `pedidos_status_check` não protegia: `liberado` é valor válido do enum.
- **Impacto técnico:** além de furar a permissão `pedidos.liberar`, dava para saltar direto a `"faturado"`, fazendo o pedido **sumir da fila de `GET /faturamento/pedidos`** (`faturamento.service.ts:48` só lista `liberado`/`parcialmente_faturado`) sem que existisse nota fiscal nem comissão.
- **Arquivos/módulos:** `backend/src/orders/dto/create-order.dto.ts:41`, `backend/src/orders/orders.service.ts:131`, `:203`, `backend/src/faturamento/faturamento.service.ts:48`, `frontend/src/pages/PedidoForm.tsx`
- **ARMADILHA ENCONTRADA NA CORREÇÃO (registrar):** `frontend/src/pages/PedidoForm.tsx` fazia `...header` no payload e `header` contém `status` — ou seja, o frontend mandava `status` em **todo** create/update. Com `forbidNonWhitelisted: true`, remover o campo só do DTO faria **todo save de pedido virar 400**. A correção teve obrigatoriamente que ser backend + frontend na mesma mudança.
- **Solução aplicada:** campo removido do `CreateOrderDto` (e por herança do `UpdateOrderDto`); `status: 'em_aberto'` fixo no create; `status` fora do `Object.assign` do update; `const { status: _status, ...headerFields } = header;` no `PedidoForm.tsx`. Status agora só muda por `PATCH /liberar`, `PATCH /status` (que só cancela) e pelo `FaturamentoService`. Ver BUG-0022.
- **Evidências/comandos:** leitura direta do código antes e depois (verificado nesta sessão: `create-order.dto.ts:41` hoje é um comentário explicando que `status` não é aceito; `orders.service.ts:132` é `status: 'em_aberto'` fixo; `PedidoForm.tsx:186` tem o descarte explícito). 3 testes novos em `orders.service.spec.ts`, incluindo **guarda de regressão que falha se `status` voltar ao DTO**.
- **Riscos residuais:** nada foi commitado; a correção não teve smoke visual em navegador nesta rodada; não há teste de integração real contra Postgres (BACKLOG-0028). O caminho de **sync** continua permitindo escrever `status` direto na tabela — ver PROB-0065, que é a mesma classe de falha por outra porta.
- **Próximo passo:** commitar; tratar PROB-0065 antes do deploy, senão o bloqueio é parcial.
- **Relacionado:** BUG-0022, PROB-0063, PROB-0065

### PROB-0063 — `DELETE /pedidos/:uuid` não checava faturamento: soft delete deixava nota fiscal e comissão ativas e impossíveis de corrigir
- **Data:** 2026-07-22
- **Origem:** revisão (confirmado por leitura direta do código nesta sessão)
- **Severidade:** BLOCKER
- **Status:** FECHADO_COM_RESSALVA
- **Área:** backend
- **Sintoma:** `backend/src/orders/orders.service.ts:304-308` — `remove()` chamava `optimisticSoftDelete` direto. `updateStatus` tinha ganhado a checagem de notas ativas; `remove()` não.
- **Causa raiz:** confirmada — guarda de integridade aplicada em um caminho de saída da máquina de estados (`updateStatus`) e esquecida no outro (`remove`).
- **Impacto técnico:** depois do soft delete do pedido, `notas_fiscais` e `comissoes` continuavam com `deleted_at IS NULL`, seguiam somando em `faturamentoBruto`/fluxo de caixa, **e a nota ficava impossível de corrigir**: `atualizarNota` e `excluirNota` faziam `orderRepo.findOne` sem `withDeleted` → 404 permanente ("Pedido vinculado não encontrado.").
- **Arquivos/módulos:** `backend/src/orders/orders.service.ts:304-308`, `backend/src/faturamento/faturamento.service.ts` (dois `findOne` de pedido)
- **Solução aplicada:** helper `countNotasAtivas()` extraído e aplicado também em `remove()` (responde 409 quando há nota ativa) + `withDeleted: true` nos dois `findOne` de `faturamento.service.ts`, este último para **sanear registros já órfãos** criados antes do fix. Ver BUG-0023.
- **Evidências/comandos:** leitura direta do código depois da correção (verificado nesta sessão: `orders.service.ts:308` define `countNotasAtivas`, usado em `:279` e `:318`; `faturamento.service.ts:234` e `:301` com `withDeleted: true` e comentário justificando). 3 testes novos em `orders.service.spec.ts` (compartilhados com PROB-0062).
- **Riscos residuais:** nada commitado; sem teste de integração real contra Postgres; o caminho de **sync** pode deletar pedido sem passar por essa guarda, reproduzindo o problema — ver PROB-0065.
- **Próximo passo:** commitar; tratar PROB-0065.
- **Relacionado:** BUG-0023, PROB-0062, PROB-0065, BACKLOG-0032

### PROB-0064 — Mass assignment em `PATCH /produtos/:uuid` e `PATCH /transportadoras/:uuid` permite escrita cruzando fronteira de tenant
- **Data:** 2026-07-22
- **Origem:** revisão / auditoria de segurança
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** segurança / backend
- **Sintoma:** `backend/src/products/products.controller.ts:58` e `backend/src/transport/transport.controller.ts:51` usam `@Body() dto: Partial<CreateXDto>` (confirmado por leitura direta nesta sessão). `Partial<T>` é **tipo TypeScript, não classe**: o `design:paramtypes` emitido é `Object`, e o `ValidationPipe` global (com `whitelist` + `forbidNonWhitelisted`) **pula metatypes nativos** — o body chega cru em `Object.assign(product, rest)` (`products.service.ts:113-114`).
- **Causa raiz:** confirmada — validação por DTO desativada de fato pelo uso de `Partial<T>` como tipo de parâmetro. `tenant_id`, `id`, `deleted_at` e `created_at` são graváveis: `PATCH {"tenant_id":"<uuid-vítima>"}` move o registro para outro tenant.
- **Impacto técnico:** **única falha identificada nesta rodada com quebra real de isolamento multi-tenant.** Também permite ressuscitar/apagar registro via `deleted_at` e falsear `created_at`.
- **Enquadramento:** **pré-existente, fora do delta de `d91b9b3`.** Mas o commit corrigiu exatamente o gêmeo disso em fornecedores (`Partial<CreateSupplierDto>` → `UpdateSupplierDto`), então sobraram **dois** pontos com o padrão antigo.
- **Arquivos/módulos:** `backend/src/products/products.controller.ts:58`, `backend/src/transport/transport.controller.ts:51`, `backend/src/products/products.service.ts:113-114`
- **Solução proposta:** criar `UpdateProductDto extends PartialType(CreateProductDto)` e `UpdateTransportDto extends PartialType(CreateTransportDto)` e usá-los nos dois controllers — mesmo padrão já aplicado em fornecedores por este commit. Depois, `grep` por `Partial<Create` no backend inteiro para garantir que não sobrou um terceiro caso.
- **Solução aplicada:** nenhuma.
- **Evidências/comandos:** leitura direta de `products.controller.ts:56-60` e `transport.controller.ts:49-53` nesta sessão, confirmando `@Body() dto: Partial<CreateXDto>`.
- **Riscos residuais:** **gate de produção** — enquanto ABERTO, qualquer usuário autenticado com `produtos.editar` ou `transportadoras.editar` consegue mover registro entre tenants.
- **Próximo passo:** delegar a `backend-engineer`. Corrigir **antes do deploy**.
- **Relacionado:** BACKLOG-0037

### PROB-0065 — Caminho de sync (push do mobile) ignora a máquina de estados de pedido introduzida pelo commit
- **Data:** 2026-07-22
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** backend / mobile / segurança
- **Sintoma:** `backend/src/sync/sync-entity-policy.ts:54` mantém `status` em `writableFields` de `pedidos` (confirmado por leitura direta nesta sessão), e o push escreve **direto na tabela**, sem passar por `OrdersService`.
- **Causa raiz:** confirmada — a máquina de estados nova foi implementada só na camada REST/serviço; o caminho de sync é uma segunda porta de escrita que não a conhece.
- **Impacto técnico:** um device pode (a) setar `faturado` sem nota fiscal; (b) rebaixar pedido faturado para `em_aberto` e depois editá-lo pela REST, furando o bloqueio de `orders.service.ts:168`; (c) alterar `total_com_imposto` de pedido faturado sem recálculo; (d) deletar o pedido, reproduzindo PROB-0063 por outra porta.
- **Arquivos/módulos:** `backend/src/sync/sync-entity-policy.ts:54`, `backend/src/orders/orders.service.ts:168`
- **Solução proposta:** decisão de arquitetura sobre **o que o mobile pode fazer offline com pedido**. Opções: remover `status` (e possivelmente os totais) de `writableFields`; ou rotear o push de `pedidos` pelo `OrdersService`; ou restringir o push a pedidos em `em_aberto`.
- **Solução aplicada:** nenhuma.
- **Evidências/comandos:** leitura direta de `sync-entity-policy.ts:50-58` nesta sessão.
- **Riscos residuais:** enquanto ABERTO, as correções de PROB-0062 e PROB-0063 são **parciais** — a mesma classe de falha continua alcançável pelo sync.
- **Próximo passo:** decisão de `software-architect`; implementação por `backend-engineer`. Deveria ser resolvido antes do deploy, junto com PROB-0062/0063.
- **Relacionado:** PROB-0062, PROB-0063, PROB-0061

### PROB-0066 — Endpoint legado `PATCH /financeiro/comissoes/:uuid` contorna a máquina de estados de comissão
- **Data:** 2026-07-22
- **Origem:** revisão
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** backend
- **Sintoma:** `backend/src/finance/finance.service.ts:211-227` + `backend/src/finance/dto/create-comissao.dto.ts:50`,`:72` (`status?: string` sem `@IsIn`) permitem gravar `status='pago'` **sem `data_pagamento`** e reescrever `valor_comissao` livremente.
- **Causa raiz:** confirmada — endpoint anterior ao ciclo comercial novo, não reconciliado com `informarPercentual`/`registrarPagamento`.
- **Impacto técnico:** comissão "paga" que nunca entra no fluxo de caixa e ainda **trava `atualizarNota`/`excluirNota`**. Com `comissoes_status_check` restaurada pela migration `0031`, status fora do enum agora resulta em **500 em vez de 400** (erro de banco vazando como erro de servidor).
- **Arquivos/módulos:** `backend/src/finance/finance.service.ts:211-227`, `backend/src/finance/dto/create-comissao.dto.ts:50`, `:72`
- **Solução proposta:** remover `status` e `valor_comissao` do DTO de update legado (ou aplicar `@IsIn(['pendente','faturado','pago'])` + exigir `data_pagamento` quando `pago`), deixando as transições só nos métodos dedicados.
- **Solução aplicada:** nenhuma.
- **Evidências/comandos:** relato de subagente de revisão com referência de arquivo:linha; **não reverificado por leitura direta nesta sessão.**
- **Riscos residuais:** dado financeiro inconsistente e 500 em input inválido.
- **Próximo passo:** delegar a `backend-engineer`.
- **Relacionado:** PROB-0059 (a restauração da constraint muda o código de erro), BACKLOG-0038

### PROB-0067 — PII completa de cliente exposta a quem só tem `faturamento.ver` (sem `clientes.ver`)
- **Data:** 2026-07-22
- **Origem:** revisão / auditoria (LGPD)
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** LGPD / segurança / backend
- **Sintoma:** `backend/src/faturamento/faturamento.service.ts:88-110` devolve a entidade `Client` **inteira** (`cnpj`, `email`, `tel`, endereço completo, `contato`, `observacao`) via `leftJoinAndSelect`. A role padrão `financeiro` tem `faturamento.ver` mas **não** tem `clientes.ver` (`shared/src/permissions/catalog.ts:120-124`).
- **Causa raiz:** confirmada — join de conveniência sem projeção de campos, ignorando a granularidade de RBAC.
- **Impacto técnico:** **não é vazamento cross-tenant** (mesmo tenant), mas contorna a granularidade de RBAC que o próprio commit reforça; é exposição de PII a papel que não deveria ter acesso ao cadastro de cliente.
- **Arquivos/módulos:** `backend/src/faturamento/faturamento.service.ts:88-110`, `shared/src/permissions/catalog.ts:120-124`
- **Solução proposta:** trocar `leftJoinAndSelect` por `leftJoin` + `addSelect` com allowlist mínima (razão social/nome fantasia e identificador), ou condicionar os campos de PII à presença de `clientes.ver`.
- **Solução aplicada:** nenhuma.
- **Evidências/comandos:** relato de subagente de revisão com referência de arquivo:linha; **não reverificado por leitura direta nesta sessão.**
- **Riscos residuais:** exposição desnecessária de PII sob LGPD; ainda não há registro de acesso (`pii_audit_events`) para esse caminho.
- **Próximo passo:** delegar a `backend-engineer` com revisão de `security-auditor`.
- **Relacionado:** LGPD_ARCHITECTURE.md

### PROB-0068 — NestJS 10.4.22 é fim de linha: 10 advisories HIGH em dependência de runtime sem correção possível na linha 10.x
- **Data:** 2026-07-22
- **Origem:** revisão (triagem própria de `npm audit --omit=dev` nesta sessão)
- **Severidade:** HIGH
- **Status:** ABERTO
- **Área:** infra / segurança / backend
- **Sintoma:** `npm audit --omit=dev` retorna 20 achados, **10 high**. O projeto está na **última 10.x que vai existir**; a linha de correção do ecossistema é NestJS 11 (11.1.28).
- **Causa raiz:** confirmada por leitura dos ranges dos advisories — o advisory do próprio `@nestjs/core` tem range `<=11.1.17`, ou seja, só corrigido em 11.1.18+: **NestJS 10 nunca vai receber o fix**. Mesma situação para os advisories de `body-parser` e `qs`.
- **Impacto técnico:** **gate de produção.** O produto vai para produção sem caminho de correção dentro da linha atual.
- **Triagem de NÃO-APLICÁVEIS (registrada de propósito, para evitar retrabalho em toda auditoria futura):**
  - `typeorm` — SQLi em `orderBy` é **MySQL/MariaDB-only**; o projeto é PostgreSQL.
  - `uuid <11.1.1` — só falha "when `buf` is provided"; o TypeORM chama `v4` **sem** `buf`.
  - `glob` — advisory é da **CLI** (`-c`/`--cmd`); o TypeORM usa como biblioteca.
  - `js-yaml` — vem de `@istanbuljs/load-nyc-config` (tooling de cobertura), não de runtime.
  - `brace-expansion` / `picomatch` — mesma cadeia de tooling.
  - `lodash` — advisory é de `_.template`; o `@nestjs/config` usa `get`/`set`.
  - `file-type` — loop no parser ASF, não usado.
  - `form-data` — não resolve na árvore de runtime do backend.
- **Arquivos/módulos:** `backend/package.json` (dependências `@nestjs/*`), árvore de `node_modules`
- **Solução proposta:** planejar a migração 10 → 11 como **item próprio com data**, não como tarefa pós-deploy (BACKLOG-0040).
- **Solução aplicada:** nenhuma para o NestJS em si. Os advisories **alcançáveis e corrigíveis sem trocar de major** foram todos tratados e fechados no segundo passe desta sessão — ver PROB-0069 (`xlsx` → `papaparse`) e PROB-0071 (`multer`/`express`/`body-parser`/`typeorm`).
- **RESULTADO DO GATE DE DEPENDÊNCIAS DESTA RODADA (2026-07-22, segundo passe):** `npm audit --omit=dev --workspace=backend` foi de **20 → 13** achados (critical 0, high 6, moderate 7). Os 13 restantes são **exatamente** os já triados acima como não-aplicáveis (`brace-expansion`, `form-data`, `glob`, `js-yaml`, `lodash`, `picomatch`) **mais** o bloco que só sai com NestJS 11 (`@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/typeorm`, `file-type`, `uuid`). **Nenhuma vulnerabilidade alcançável permanece aberta.** Isso **fecha o gate de dependências desta rodada** e deixa **BACKLOG-0040 (NestJS 10 → 11) como o único caminho para os 13 restantes.**
- **Evidências/comandos:** `npm audit --omit=dev` executado nesta sessão (antes e depois) + leitura dos ranges de cada advisory.
- **Riscos residuais:** ir para produção com 13 advisories abertos numa linha sem manutenção — **todos triados como não-alcançáveis hoje**, mas a triagem vale para o código atual: qualquer novo uso de `@nestjs/*` ou de `file-type`/`uuid` pode reabrir a exposição sem aviso.
- **Próximo passo:** decisão do usuário sobre a data da migração; ver BACKLOG-0040.
- **Relacionado:** PROB-0069, PROB-0071, BUG-0024, BUG-0026, BACKLOG-0040

### PROB-0069 — `xlsx@0.18.5` com 2 advisories HIGH sem correção no npm, recebendo upload de usuário em `POST /produtos/importacao`
- **Data:** 2026-07-22
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** FECHADO (2026-07-22, segundo passe da mesma sessão)
- **Área:** segurança / backend
- **Sintoma:** dois advisories HIGH **sem versão corrigida disponível no registry** — prototype pollution `GHSA-4r6h-8v6p-xvw6` e ReDoS `GHSA-5pgg-2g8v-p4x9` — em uma lib que recebe **upload de usuário** em `POST /produtos/importacao`. Somado a isso, o limite `IMPORT_MAX_ROWS` é aplicado **depois** de `XLSX.read` + `sheet_to_json` materializarem o arquivo inteiro: DoS por planilha comprimida, e o limite de 5 MB do multer **não protege** porque `.xlsx` é um ZIP.
- **Causa raiz:** confirmada — dependência sem manutenção no caminho de correção do npm, exposta diretamente a input não confiável.
- **Impacto técnico:** superfície de ataque direta (prototype pollution/ReDoS) e DoS por descompressão em endpoint autenticado.
- **Solução em andamento:** substituição de `xlsx@0.18.5` por **`papaparse`** — a importação passa a ser **só CSV** (`.xlsx` não é requisito; **decidido pelo usuário**). Comparação registrada: `papaparse` 5.5.4, MIT, 267 KB, **zero dependências transitivas**, publicado 2026-06. **Descartados:** `exceljs` (21,8 MB, parado desde 2024-12, puxa `unzipper` e `uuid@^8` vulnerável) e SheetJS via CDN (tira a dependência do registry, **cega o `npm audit`** e quebra proxies corporativos). No mesmo trabalho: limite de linhas aplicado **durante** o parse, `@Throttle` de 5/min na rota, e tratamento de separador `;`, BOM e latin1.
- **Arquivos/módulos:** `backend/src/products/products.service.ts` (fluxo de importação), `backend/src/products/products.controller.ts` (rota `POST /produtos/importacao`), `backend/package.json`
- **Solução aplicada (fechamento):** `xlsx` removido de `backend/package.json` (verificado por leitura direta: não há mais referência à lib fora do nome de um caso de teste); `papaparse@^5.5.4` + `@types/papaparse` no lugar; `IMPORT_ALLOWED_EXTENSIONS = ['csv']` (`products.service.ts:13`). `normalizeImportRow`, o loop de upsert e o `ImportProductsResultDto` **ficaram intactos** — a mudança é de camada de parse, não de contrato de saída.
- **Detalhes técnicos registrados de propósito (evitam retrabalho):**
  - **`import * as Papa from 'papaparse'`, nunca `import Papa from`.** O `tsconfig` tem `allowSyntheticDefaultImports` **sem** `esModuleInterop`: o default import compilaria e **quebraria em runtime**. Verificado em `products.service.ts:5`.
  - **DoS corrigido no lugar certo:** `preview: IMPORT_MAX_ROWS + 1` (`:238`) limita **durante** o parse; a checagem `rows.length > IMPORT_MAX_ROWS` (`:245`) vem depois só para decidir o 400. Confirmado empiricamente que, com `header: true`, o `preview` conta **linhas de dados** (header fora), então a comparação continua exata. Há teste garantindo que 5000 linhas legítimas ainda passam.
  - **Rate limit real:** `@Throttle({ default: { ttl: 60_000, limit: 5 } })` em `products.controller.ts:30`. Confirmado que o `UserThrottlerGuard` é `APP_GUARD` global com chave por `user.sub` — o limite é **por usuário** e vigora de fato, não é decoração.
  - **Encoding:** `decodeCsvBuffer` (`:31`) remove BOM, decodifica com `TextDecoder('utf-8', { fatal: true })` e só cai para `windows-1252` quando o buffer **comprovadamente** não é UTF-8. Usar `fatal` em vez de procurar `` é o ponto: heurística por caractere de substituição reinterpretaria arquivo UTF-8 legítimo por engano. 3 testes (UTF-8 puro, UTF-8 com BOM, Windows-1252).
  - **Separador `;` do Excel pt-BR:** `delimiter: ''` (auto-detecção do papaparse). Testes com `,` e com `;`.
  - **Prototype pollution via header `__proto__` no CSV foi analisada e NÃO é explorável:** o papaparse atribui string por bracket notation e `Object.entries` só lista own properties.
- **MUDANÇA DE CONTRATO (precisa de aviso ao usuário final — BACKLOG-0042):** `.xlsx` agora recebe **400** com `'Tipo de arquivo inválido. Utilize .csv (UTF-8).'`. **Quem já importava planilha `.xlsx` perde o fluxo.** O frontend foi atualizado no mesmo trabalho (`frontend/src/pages/Produtos.tsx`: `accept='.csv,text/csv'`, label `Arquivo (.csv)`, instrução "Arquivo > Salvar como > CSV UTF-8", as 3 colunas esperadas `codigo`/`descricao`/`preco_base`, limite de 5.000 linhas) — **mas UI não substitui comunicação a quem usa.** Shape do `ImportProductsResultDto` inalterado; **mobile não consome essa rota**.
- **Evidências/comandos:** `npm audit --omit=dev --workspace=backend` (20 → 13 achados); suíte backend **260/260** em 38 suites (baseline do commit era 236); lint e build limpos; estado final reverificado por leitura direta de `products.service.ts`, `products.controller.ts`, `Produtos.tsx` e `backend/package.json` por este agente.
- **Riscos residuais:** (a) **nada rodou contra Postgres real** — os testes de import usam `manager` mockado, o caminho `dataSource.transaction` + upsert não foi exercido contra banco (BACKLOG-0028); (b) **não foi testado com arquivo real exportado do Excel pt-BR** — os bytes foram simulados, o que cobre a mecânica, mas um teste manual antes do go-live é barato (BACKLOG-0045); (c) **`preview` não limita memória** — o buffer inteiro é decodificado para string antes do parse, então o bound real continua sendo o limite de 5 MB do multer; o `preview` limita o array de linhas e o loop O(n), não a string (BACKLOG-0046).
- **Próximo passo:** commitar; comunicar a mudança de contrato (BACKLOG-0042).
- **Relacionado:** BUG-0024, PROB-0068, PROB-0070, PROB-0071, BACKLOG-0033, BACKLOG-0042, BACKLOG-0045, BACKLOG-0046

### PROB-0070 — Parse de `preco_base` rejeita todo preço acima de mil exportado do Excel pt-BR
- **Data:** 2026-07-22
- **Origem:** revisão (bug pré-existente, encontrado ao trabalhar em PROB-0069)
- **Severidade:** MEDIUM
- **Status:** FECHADO (2026-07-22, segundo passe da mesma sessão)
- **Área:** backend
- **Sintoma:** `backend/src/products/products.service.ts:206` faz `Number(preco_base.replace(',', '.'))` — `"1.234,56"` vira `"1.234.56"` → `NaN`. Na prática, **todo preço acima de mil exportado do Excel em pt-BR é rejeitado hoje** na importação de produtos.
- **Causa raiz:** confirmada — troca só a vírgula decimal, sem remover o separador de milhar.
- **Impacto técnico:** importação em lote silenciosamente incompleta ou com linhas rejeitadas, exatamente nos produtos de maior valor.
- **Arquivos/módulos:** `backend/src/products/products.service.ts` — helper `parseImportPrice` (`:55`), usado em `:288`
- **Solução aplicada (fechamento):** função `parseImportPrice` dedicada, com **12 casos testados**. Regra: havendo os dois separadores, o mais à direita é o decimal e o outro é milhar; retorna `NaN` para qualquer entrada que não seja estritamente numérica depois da normalização. Verificado por leitura direta por este agente.
- **Duas DECISÕES (não detalhes de implementação) que precisam ficar registradas:**
  1. **`"1.234"` continua sendo lido como 1.234, não 1234.** É genuinamente ambíguo (milhar ou decimal) e mudar isso **multiplicaria preço por mil silenciosamente**. Preservado o comportamento atual, que é o lado seguro do erro. Se algum dia for revisto, tem que ser com decisão explícita do usuário.
  2. **Gap real introduzido pela primeira versão da correção e fechado antes do fim:** o parser aceitava `"12,,50"` como **1250** — não era fixture ruim, era a regra "várias vírgulas = separador de milhar" sem validar o **agrupamento**. Passou a exigir `^-?\d{1,3}([.,]\d{3})+$` (constante `THOUSANDS_GROUPED`, `:44`) antes de remover separador. **Regex ancorada nas duas pontas e sem quantificador aninhado ambíguo — linear, sem ReDoS.**
- **Evidências/comandos:** suíte backend **260/260** nesta sessão (12 casos cobrindo `parseImportPrice`); leitura direta do helper por este agente.
- **Riscos residuais:** **dados já importados antes do fix podem estar faltando produtos — não auditado.** Nenhum backfill/reconciliação foi feito.
- **Próximo passo:** commitar; se houver suspeita de importação incompleta em produção, auditar produtos acima de mil reais por cliente.
- **Relacionado:** BUG-0025, PROB-0069, BACKLOG-0045

### PROB-0071 — `multer@2.0.2` com advisory HIGH alcançável via `FileInterceptor`
- **Data:** 2026-07-22
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** FECHADO (2026-07-22, segundo passe da mesma sessão)
- **Área:** segurança / infra
- **Sintoma:** `multer` instalado na versão 2.0.2, com advisory HIGH afetando `<=2.1.1`, **alcançável** pelo uso de `FileInterceptor` na importação de produtos.
- **Causa raiz:** confirmada — versão transitiva desatualizada, fixada em versão **exata** por `@nestjs/platform-express@10.4.22`.
- **Impacto técnico:** advisory HIGH em caminho que recebe upload de usuário.
- **Solução aplicada (fechamento):** bloco `overrides` no `package.json` da **raiz** — `multer: ^2.2.0`, `express: ^4.22.2`, `body-parser: ^1.20.6` — acompanhado de um bloco `comments.overrides` no próprio arquivo, documentando o motivo de cada override e **a condição de remoção** (migração para NestJS 11 / `platform-express >= 11.1.28`). Verificado por leitura direta do `package.json` da raiz por este agente.
- **Por que na raiz:** o npm só honra `overrides` no `package.json` **da raiz** em projetos com workspaces. Verificado em teste isolado nesta sessão.
- **Versões efetivas, confirmadas por `npm ls` e reconferidas em disco por este agente:** `multer@2.2.0`, `express@4.22.2`, `body-parser@1.20.6`, `qs@6.15.3`, `path-to-regexp@0.1.13`, `typeorm@0.3.31`. (`qs` e `path-to-regexp` vêm pelo próprio `express@4.22.2`, não têm override próprio; `typeorm` foi bumpado em `backend/package.json` para `^0.3.31`.)
- **TRÊS ACHADOS OPERACIONAIS que vão morder de novo — registrados de propósito:**
  1. **`npm install` NÃO aplica os overrides.** O lockfile já tinha a árvore materializada e o npm 10.9.8 não re-resolve. Pior: **editar o lock na mão removeu `express`/`multer`/`body-parser` da árvore** — a aplicação não subiria. O que funcionou foi `npm update multer express body-parser typeorm path-to-regexp`, que re-resolve **só o alvo** sem regenerar o lock inteiro. **Deletar o `package-lock.json` foi descartado deliberadamente:** re-resolveria todos os `^` do expo/react-native.
  2. **`body-parser` precisou de override próprio, além de `express`.** `@nestjs/platform-express@10.4.22` depende de `body-parser` **direto e em versão exata** (`1.20.4`), então o override de `express` **não alcança**.
  3. **O bump de `typeorm` criou duas cópias em disco** (`node_modules/typeorm@0.3.28`, puxada pelo peer do `@nestjs/typeorm`, + `backend/node_modules/typeorm@0.3.31`). **Duas instâncias de TypeORM no mesmo processo duplicam o metadata storage e quebrariam em produção.** `npm update typeorm` deduplicou. Estado atual reconferido por este agente: existe **uma única** cópia, em `node_modules/typeorm@0.3.31`; `backend/node_modules/typeorm` não existe mais. **Conferir cópia única depois de qualquer `npm install` futuro** — virou BACKLOG-0044.
- **Verificação extra (o ponto que build verde não cobre):** build passando **não prova** que `multer@2.2.0` funciona sob `platform-express@10`. Foi escrito um teste temporário com Nest + supertest subindo um `FileInterceptor` de verdade: **upload multipart chegou com buffer íntegro e arquivo de 6 MB recebeu 413.** **O arquivo foi removido depois — não está no diff.** Candidato a guarda permanente: BACKLOG-0043.
- **Arquivos/módulos:** `package.json` e `package-lock.json` (raiz), `backend/package.json`
- **Evidências/comandos:** `npm audit --omit=dev --workspace=backend` (20 → 13); `npm ls` para versões efetivas; teste temporário Nest+supertest com `FileInterceptor` (removido); suíte completa verde nos três workspaces (shared 8/8, backend 260/260, frontend 29/29), lint e build limpos.
- **Riscos residuais:** os `overrides` forçam versão em **toda** a árvore, inclusive fora do backend — a suíte verde reduz, mas não elimina, o risco de regressão em pacote não coberto por teste. A garantia funcional do multer sob platform-express 10 **não ficou no repositório** (BACKLOG-0043). A duplicação de `typeorm` pode voltar em qualquer `npm install` (BACKLOG-0044).
- **Próximo passo:** commitar; remover o bloco de overrides quando BACKLOG-0040 (NestJS 11) for concluído.
- **Relacionado:** BUG-0026, PROB-0068, PROB-0069, BACKLOG-0040, BACKLOG-0043, BACKLOG-0044

---
# MetaRenowa — fechamento P0 (21/07/2026)

O cálculo de pedidos passou a ter autoridade única no backend, com `decimal.js`, persistência dos derivados e substituição transacional versionada. O frontend deixou de enviar totais, ganhou fluxo único de criação/edição e PDF de validação baseado exclusivamente no registro persistido. Divergências históricas são diagnosticadas pelo relatório SQL, sem regravação automática. Ver `docs/MetaRenowa.md`.
