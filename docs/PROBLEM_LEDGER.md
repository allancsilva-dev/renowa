# PROBLEM_LEDGER — Renowa

> Contém apenas problemas **em aberto**. Registros fechados foram removidos na limpeza pré-produção (2026-07-23); o histórico permanece no git.

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
