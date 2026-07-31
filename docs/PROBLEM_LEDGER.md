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
- **Status:** FECHADO (2026-07-31) — o original já estava corrigido; o **sucessor** foi corrigido agora (FIX-0028).
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
- **Evidência de fechamento (2026-07-31):** o `AutoProvisionGuard` não existe mais — foi substituído por `backend/src/common/guards/local-user-context.guard.ts` no commit `0f066ae`, cujo cabeçalho documenta a remoção do ramo que buscava a role `viewer`, com regressão em `local-user-context.guard.spec.ts`. **Mas o mesmo sintoma operacional continuava alcançável por outro mecanismo:** a tela de Usuários oferecia `manager`/`viewer` (e usava `viewer` como default), nomes sem template em `DEFAULT_ROLE_PERMISSIONS` — o backend criava a `tenant_role` vazia e o usuário logava para tomar 403 em toda tela. Havia quatro vocabulários de perfil independentes (backend, `UsuariosPage`, `lib/authorization.ts`, `AuditoriaPage`). Corrigido em **FIX-0028**: fonte única em `@renowa/shared` (`ROLE_TEMPLATES`), backend recusando com 400 nome sem template que não exista no tenant, e remoção do caminho de criação implícita de `local_users` com e-mail forjado. Evidências: `npm test --workspace=shared` → 13 passed; `... -- users.service.provisioning` → 8 passed.
- **Relacionado:** Etapas 1-4 do RBAC overhaul (catálogo de permissões, migration+backfill do admin, provisionamento explícito de tenant_roles, remoção do bypass hardcoded de admin + fim do `RolesGuard`)

---

### PROB-0061 — Infra de sync das migrations `0008`/`0009` não existe no banco de dev, apesar de ambas constarem como aplicadas em `schema_migrations`
- **Data:** 2026-07-22
- **Origem:** revisão (achado próprio ao verificar o estado do banco durante a investigação de PROB-0059)
- **Severidade:** HIGH
- **Status:** FECHADO em dev (2026-07-31). Produção segue **não verificada** — BACKLOG-0041.
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
- **Evidência de fechamento (2026-07-31):** os objetos já haviam sido restaurados em 2026-07-29 (reaplicação de `0008`/`0009` via `psql`, registrada no fechamento de PROB-0072) e este registro é que ficou para trás. Confirmado agora por catálogo, não por `schema_migrations`: `db:verify` contra o dev → `[5/7] 14/14 objetos de sync presentes`, verdito `OK: schema íntegro`. O verificador ganhou a seção que faltava (FIX-0029): sequence `sync_change_revision_seq`, os seis triggers `trg_*_sync_outbox` e a coluna `version` das seis tabelas da `0009` — antes, trigger de outbox derrubado era **invisível**, porque a seção de triggers só olhava `set_updated_at` e `CREATE OR REPLACE FUNCTION` restaura a função sem restaurar os triggers. A causa mecânica candidata (BACKLOG-0035) não é mais reproduzível: nenhum dos 35 `.sql` tem controle de transação próprio, e `migrations-hygiene.spec.ts` fixa a invariante.
- **Relacionado:** PROB-0059, PROB-0060, BACKLOG-0035, BACKLOG-0039, BACKLOG-0041

### PROB-0064 — Mass assignment em `PATCH /produtos/:uuid` e `PATCH /transportadoras/:uuid` permite escrita cruzando fronteira de tenant
- **Data:** 2026-07-22
- **Origem:** revisão / auditoria de segurança
- **Severidade:** HIGH
- **Status:** FECHADO (verificado em 2026-07-31)
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
- **Evidência de fechamento (2026-07-31):** a correção já estava no código desde o commit `0f066ae`, e o ledger é que estava atrasado. `UpdateProductDto`/`UpdateTransportDto` usam `PartialType(CreateXDto)`, os dois controllers recebem as classes, e `main.ts` mantém `whitelist` + `forbidNonWhitelisted`. O "terceiro caso" que o `grep` original não pegaria virou teste de arquitetura: `backend/src/common/architecture/body-dto-metatype.spec.ts` varre **todo** `@Body()` sem chave em todos os controllers e reprova metatype nativo. `npm test --workspace=backend -- body-dto-metatype` → **20 passed**, 20 controllers cobertos.
- **Relacionado:** BACKLOG-0037

### PROB-0065 — Caminho de sync (push do mobile) ignora a máquina de estados de pedido introduzida pelo commit
- **Data:** 2026-07-22
- **Origem:** revisão
- **Severidade:** HIGH
- **Status:** FECHADO (2026-07-31) — ver FIX-0027.
- **Área:** backend / mobile / segurança
- **Sintoma:** `backend/src/sync/sync-entity-policy.ts:54` mantém `status` em `writableFields` de `pedidos` (confirmado por leitura direta nesta sessão), e o push escreve **direto na tabela**, sem passar por `OrdersService`.
- **Causa raiz:** confirmada — a máquina de estados nova foi implementada só na camada REST/serviço; o caminho de sync é uma segunda porta de escrita que não a conhece.
- **Impacto técnico:** um device pode (a) setar `faturado` sem nota fiscal; (b) rebaixar pedido faturado para `em_aberto` e depois editá-lo pela REST, furando o bloqueio de `orders.service.ts:168`; (c) alterar `total_com_imposto` de pedido faturado sem recálculo; (d) deletar o pedido, reproduzindo PROB-0063 por outra porta.
- **Arquivos/módulos:** `backend/src/sync/sync-entity-policy.ts:54`, `backend/src/orders/orders.service.ts:168`
- **Solução proposta:** decisão de arquitetura sobre **o que o mobile pode fazer offline com pedido**. Opções: remover `status` (e possivelmente os totais) de `writableFields`; ou rotear o push de `pedidos` pelo `OrdersService`; ou restringir o push a pedidos em `em_aberto`.
- **Solução aplicada:** nenhuma.
- **Evidências/comandos:** leitura direta de `sync-entity-policy.ts:50-58` nesta sessão.
- **Riscos residuais:** enquanto ABERTO, as correções de PROB-0062 e PROB-0063 são **parciais** — a mesma classe de falha continua alcançável pelo sync.
- **Atualização (2026-07-29) — segue ABERTO, mas com o mecanismo pronto:** PROB-0074 introduziu `writableFieldsFor` em `SyncEntityPolicy`, o gancho que deriva a allowlist da linha corrente. É exatamente o que este problema precisa: `status` já não é gravável em pedido de **origem externa**. Removê-lo para **toda** origem foi deliberadamente adiado — `mobile/SyncService.ts` recebe `payload: Record<string, unknown>` de uma fila cujo produtor não foi localizado, e a tabela SQLite local tem coluna `status`, então não há como provar que o mobile nunca o envia. Tirar `status` de `writableFields` globalmente é quebra de contrato num cliente que o escopo atual proíbe alterar e validar. Há teste de regressão fixando que `status` **continua** gravável em pedido interno (`sync.service.spec.ts`), justamente para que fechar isto seja uma decisão explícita e não um efeito colateral.
- **Atualização (2026-07-30) — o escopo do problema cresceu, e continua ABERTO:** `writableFields` de `itens_pedido` inclui **`total_item`** (`sync-entity-policy.ts:136-139`, leitura direta nesta data), e `total_item` é justamente onde `OrdersService` persiste `total_item_sem_imposto` (`orders.service.ts:114`). O push escreve esse valor **direto na tabela, sem passar por `calculateOrderItem`**. Com FIX-0023 a aritmética do item mudou de política (arredondamento no total da linha, não no unitário), então o sync agora é uma segunda porta de escrita que **desconhece a política vigente**: um device que calcule localmente à moda antiga grava linha com centavos a mais e o cabeçalho do pedido não é recalculado por ninguém. Note que a allowlist **não** inclui `ipi_perc`, `valor_com_desconto` nem `valor_com_imposto` — o item gravado pelo sync fica com total sem os campos de leitura correspondentes.
- **Próximo passo:** decidir o caminho de transição de status para o sync, com contraparte no cliente mobile. Depende de escopo que inclua `mobile/`. Na mesma decisão, avaliar remover `total_item` de `writableFields` — total é derivado, e derivado não deveria ser campo de entrada em porta nenhuma.
- **Evidência de fechamento (2026-07-31):** o núcleo de escrita de pedido virou `backend/src/orders/order-write.ts`, e as duas portas — REST e push de sync (`sync/writers/orders-sync.writer.ts`) — chamam as mesmas funções. `status` passou a `serverControlledFields` e os totais a `derivedFields` (categoria nova na policy) para **toda** origem; `total_item` saiu da allowlist do item e `ipi_perc` entrou. Com isso `writableFieldsFor` e `assertCamposDaForma` ficaram sem função e foram removidos — a proteção de PROB-0074 ficou mais forte, não mais fraca. Gates novos: item exige pedido pai `interno` e `em_aberto`; toda escrita de item recalcula o cabeçalho na mesma transação; DELETE de pedido passa pela guarda de nota fiscal ativa nos dois protocolos; UPDATE do v1 passou a incrementar `version`. `npm test --workspace=backend` → **669 passed** (59 suítes), com `orders.service.spec.ts` passando **sem edição** — a prova de que a extração não mexeu no comportamento da web — e os dois pins de "status gravável em pedido interno" invertidos. Fronteira fixada por `sync-write-boundary.spec.ts` em três camadas: declaração na policy (`writer`), comportamento (toda operação de pedido passa pelo writer) e varredura de fonte contra SQL literal em pedido fora dos módulos donos.
- **Não coberto:** ownership de vendedor no push (BACKLOG-0078, anterior a este problema e válido para todas as entidades) e o risco de cliente implantado fora desta árvore — mitigado por log estruturado `sync_write_rejected`, ver ressalvas de FIX-0027.
- **Relacionado:** PROB-0062, PROB-0063, PROB-0061, PROB-0074, BACKLOG-0065, FIX-0023

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
- **Atualização (2026-07-31):** segue ABERTO **por decisão do usuário**, tomada depois de a superfície de migração ter sido levantada e registrada em BACKLOG-0040 (versões exatas a subir, o bloco `overrides` da raiz a remover, os cinco pontos de risco em ordem, e o que foi verificado como não aplicável). O ponto que mais pesa na decisão de data: `@nestjs/testing` aparece em **1** dos 59 specs e não há teste de integração HTTP nem Postgres no CI — **suíte verde não certifica esta migração**, então a janela precisa incluir verificação manual pelo `ops/qa-safari/`.
- **Relacionado:** PROB-0069, PROB-0071, BUG-0024, BUG-0026, BACKLOG-0040

### PROB-0072 — Banco de dev bloqueado para migrar: checksum de `0007_optimistic_concurrency.sql` diverge do arquivo
- **Data:** 2026-07-29
- **Origem:** implementação (fotos/pedido externo/SAC)
- **Severidade:** ~~HIGH~~ → **BLOCKER** (elevada na auditoria de 2026-07-29: o bloqueio não é só do ambiente local)
- **Status:** FECHADO (2026-07-29)
- **Área:** banco / infra
- **Sintoma:** `npm run db:migrate --workspace=backend` contra o banco de dev (`postgresql://renowa:***@localhost:5433/renowa`) aborta imediatamente com `Error: Migration já aplicada foi alterada: 0007_optimistic_concurrency.sql`. **Nenhuma migration nova consegue ser aplicada nesse banco** — inclusive as três desta rodada (`0033`/`0034`/`0035`).
- **Causa raiz:** **confirmada** (auditoria 2026-07-29). O arquivo `0007` foi alterado pelo commit **`0f066ae`** ("fix(deploy): destravar producao em VPS com banco vazio"), que removeu o `BEGIN/COMMIT` interno (BACKLOG-0035). O banco de dev tinha aplicado a versão anterior, do commit `c5fa24a`. O runner (`backend/src/database/migrate.ts:38-41`) trata migration aplicada como **imutável** e falha por design. O `git status` limpo não contradiz isso: a alteração está **commitada**, não pendente.
- **Impacto técnico:** **maior que o registrado originalmente.** A diferença entre as duas versões do arquivo é só controle de transação — nenhum DDL. Portanto **todo banco provisionado antes de `0f066ae` está igualmente travado, inclusive produção**; não é um problema de ambiente local. Banco vazio continua aplicando tudo do zero sem erro, o que é exatamente o que mascarou o alcance real. Enquanto durar, também **bloqueia validação ponta a ponta pela UI** (BACKLOG-0049).
- **Arquivos/módulos:** `backend/src/database/migrate.ts:38-41` (checagem de checksum), `backend/src/database/migrations/0007_optimistic_concurrency.sql`, tabela `public.schema_migrations`
- **Solução proposta:** **allowlist de checksum versionada no `migrate.ts`** (decisão do usuário em 2026-07-29): mapa `CHECKSUMS_SUPERSEDIDOS` aceitando o hash antigo de `0007`, com o motivo documentado no código. Destrava dev e produção pelo mesmo caminho revisável e não repete o problema no próximo ambiente. Patch pronto em `docs/REVIEW_REPORTS/2026-07-29_audit_fotos-pedido-externo-sac.md` §6.2. Descartadas: `UPDATE` manual em `schema_migrations` (não versionado, deixa produção travada) e recriar o banco de dev (não resolve banco com dados).
- **Solução aplicada (2026-07-29):** allowlist `CHECKSUMS_SUPERSEDIDOS` em `backend/src/database/migrate.ts`, aceitando o hash antigo de `0007` com o motivo documentado no código. A versão anterior do arquivo ficou preservada como fixture versionada em `backend/src/database/migrations/.superseded/0007_optimistic_concurrency.f5d5654c.sql` — e não como `git show` no teste, porque o CI usa `actions/checkout@v4` com `fetch-depth` padrão (clone raso) e `git show <sha>:<path>` não resolve no runner. Quatro casos novos em `migrations-hygiene.spec.ts` impedem que a allowlist vire porta dos fundos: todo hash aceito tem fixture que o produz, a fixture difere do arquivo atual **apenas** em linhas de controle de transação (reusando o mesmo regex do teste vizinho), nenhuma fixture fica órfã e o runner continua sem enxergar `.superseded/`.
- **Evidências/comandos:** `shasum -a 256` do arquivo → `dd64bf244f9811eb734bc1690ca31511f005ed28834c7a47e0c260afe166c201`; `SELECT checksum FROM public.schema_migrations WHERE name='0007_optimistic_concurrency.sql'` → `f5d5654ce8b0c55c54f4c127c1f1123fa1b3f642f4fa5e3586454227a5de4c63`; `git show c5fa24a:…0007… | shasum -a 256` bate com o registrado e `git show 0f066ae:…0007… | shasum -a 256` bate com o arquivo atual. É a **única** divergência entre as 19 migrations aplicadas e os arquivos. **Evidência de catálogo (não de `schema_migrations`)** de que o efeito está no banco: `version integer NOT NULL DEFAULT 1` presente em `pedidos`, `financeiro_movimentacao`, `comissoes`, `parceiros_comerciais` e `inadimplencia`, e os cinco `<tabela>_version_check` presentes em `pg_constraint`.
- **Riscos residuais:** enquanto aberto, toda validação de schema em dev depende de banco descartável — **nenhuma feature nova é exercitada pela UI contra o schema real antes de ir para produção** — e o próximo deploy em base existente falha no `db:migrate`.
- **Evidência de fechamento (2026-07-29):** `npm test --workspace=backend -- migrations-hygiene` → 36 passed. `DATABASE_URL=…/renowa npm run db:migrate --workspace=backend` → aplicou `0033_pedido_origem_externa.sql`, `0034_pedido_fotos.sql`, `0035_sac_chamados.sql` sem erro, e depois `0036`/`0037`. `SELECT count(*), max(name) FROM public.schema_migrations` no banco de dev saiu de `19 | 0032_produto_ipi_perc.sql` para `24 | 0037_lgpd_purga_e_totais_externos.sql`.
- **Achado colateral (dev):** com o `db:migrate` destravado, o `db:verify` reprovou o banco de dev por drift **anterior** a este trabalho: `0008_sync_change_feed.sql` e `0009_sync_push_v2.sql` constavam aplicadas em `schema_migrations` e seus objetos não existiam (`sync_outbox`, `sync_changes`, `sync_mutation_inbox`, `capture_sync_outbox()`, `drain_sync_outbox()`) — a assinatura clássica de PROB-0059, já prevista no comentário de `0031_restore_schema_invariants.sql:42-44`. Ambas são integralmente idempotentes (`CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`), então foram reaplicadas via `psql` no banco de dev, por decisão do usuário, sem tocar em `schema_migrations`. `db:verify` passou limpo em seguida. **Produção não foi verificada** — pode ter o mesmo drift.
- **Riscos residuais (pós-fechamento):** a allowlist afrouxa, por definição, a única proteção contra arquivo de migration editado depois de aplicado. Entrada nova exige o mesmo rito: fixture versionada, hash conferido por teste e diferença limitada a controle de transação. `AGENTS.md` passou a registrar que editar migration aplicada — **inclusive só um comentário** — trava `db:migrate`.
- **Próximo passo:** rodar `db:migrate` + `db:verify` contra produção na próxima janela e registrar a saída. É lá que o bloqueio nunca foi observado diretamente.
- **Relacionado:** PROB-0059, BACKLOG-0028, BACKLOG-0035, BACKLOG-0041, BACKLOG-0048, BACKLOG-0049

### PROB-0073 — Tabelas anteriores à `0021` podem não ter `UNIQUE(tenant_id, id)`, alvo exigido pelas FKs compostas de tenant
- **Data:** 2026-07-29
- **Origem:** implementação (fotos do pedido)
- **Severidade:** MEDIUM
- **Status:** FECHADO (2026-07-29)
- **Área:** banco / segurança
- **Sintoma:** ao criar a FK composta de `pedido_fotos` para `itens_pedido (tenant_id, id)`, o PostgreSQL recusou com `there is no unique constraint matching given keys for referenced table "itens_pedido"` (SQLSTATE 42830). `itens_pedido` tinha apenas `UNIQUE(tenant_id, uuid)` e a PK simples em `id`.
- **Causa raiz:** confirmada — `itens_pedido` é anterior ao padrão estabelecido em `0021_cross_tenant_foreign_keys.sql`, que passou a exigir `UNIQUE(tenant_id, id)` em toda tabela. O índice nunca foi criado retroativamente para as tabelas antigas que não eram alvo de FK naquele momento.
- **Impacto técnico:** **nenhuma FK composta de tenant pode apontar para uma tabela sem esse índice.** Ou seja, o mecanismo que garante isolamento multi-tenant no nível do banco fica indisponível para essas tabelas — a próxima feature que precisar referenciá-las esbarra no mesmo erro, e a saída fácil (criar a FK só por `id`, sem `tenant_id`) **abriria referência cross-tenant**.
- **Arquivos/módulos:** `backend/src/database/migrations/0034_pedido_fotos.sql`, `backend/src/database/migrations/0021_cross_tenant_foreign_keys.sql`
- **Solução proposta:** auditar todas as tabelas tenant-scoped e criar `UNIQUE(tenant_id, id)` onde faltar — ver BACKLOG-0048 e BACKLOG-0052. Migration `0036` pronta (aditiva, idempotente, nove índices) em `docs/REVIEW_REPORTS/2026-07-29_audit_fotos-pedido-externo-sac.md` §6.1.
- **Solução aplicada:** **parcial.** A migration `0034` cria `uq_itens_pedido_tenant_id_id` antes da FK, resolvendo o caso de `itens_pedido`. **Auditoria das demais concluída em 2026-07-29** (abaixo), mas nenhum índice novo foi criado ainda.
- **Auditoria (2026-07-29) — nove tabelas tenant-scoped sem o índice:** `comissoes`, `financeiro_movimentacao`, `inadimplencia`, `lgpd_requests`, `local_users`, `mobile_sessions`, `parceiros_comerciais`, `pii_audit_events`, `tenant_role_permissions`.
- **Reclassificação do risco:** cruzando com as 20 FKs compostas existentes, **nenhuma das nove é alvo de FK composta hoje** — todos os alvos atuais (`clientes`, `fornecedores`, `notas_fiscais`, `pedidos`, `produtos`, `usuarios`, `tenant_roles`, `refresh_tokens`, `transportadoras`) já têm o índice. **Não há FK cross-tenant aberta no schema.** É risco latente que trava a próxima FK — como travou a `0034` —, não brecha de isolamento ativa.
- **Evidências/comandos:** `SELECT indexname, indexdef FROM pg_indexes WHERE tablename='itens_pedido'` em banco recém-migrado — só `PK(id)`, `UNIQUE(tenant_id,uuid)` e índices não-únicos. Após `0034`, `db:verify` passou limpo. Auditoria de 2026-07-29 no banco de dev (schema em `0032`): varredura de `pg_index` com `indisunique AND indpred IS NULL AND indnatts = 2` sobre `(tenant_id, id)` — a heurística do enunciado foi corrigida em dois pontos antes do uso (`indpred IS NULL`, porque índice único **parcial** não serve como alvo de FK, e `NOT attisdropped`) — e o resultado foi **confirmado tabela a tabela** por `pg_indexes`. Alvos das FKs compostas levantados por `SELECT conrelid::regclass, confrelid::regclass FROM pg_constraint WHERE contype='f' AND array_length(conkey,1)=2`.
- **Riscos residuais:** o `db:verify` **não checa** presença de `UNIQUE(tenant_id, id)`; só valida CHECKs, índices únicos **parciais**, tabelas e triggers. Enquanto não for corrigido (BACKLOG-0052), a lacuna volta a passar despercebida. Atenção à ordem: ligar a checagem antes da `0036` reprova todo ambiente.
- **Solução aplicada (2026-07-29):** migration `0036_unique_tenant_id.sql` cria os nove índices (aditiva, idempotente, sem `BEGIN/COMMIT` próprio), e `verify-schema.ts` ganhou **duas** seções novas, não uma:
  - `[5/6] FKs para tabela de tenant sem tenant_id na chave` — **a doença, não o sintoma.** O PostgreSQL já recusa FK composta sem índice único no alvo (42830), então verificar "alvo de FK tem o índice" é tautológico. O que ninguém verificava é o **atalho**: FK para tabela com `tenant_id` que omite `tenant_id` na chave permite referência cross-tenant, e é a saída fácil de quem esbarra no 42830. Trava o resultado de `0021`/PROB-0011 contra regressão. Hoje: 0 violações, 26 FKs compostas.
  - `[6/6] UNIQUE(tenant_id, id)` — a prontidão, com a query do relatório **corrigida** em dois pontos: `indnkeyatts` no lugar de `indnatts` (em PG11+ `indnatts` conta chave **mais** colunas INCLUDE, então `(tenant_id) INCLUDE (id)` passaria e não serviria de alvo) e `indisvalid AND indisready` (um `CREATE INDEX CONCURRENTLY` abortado deixa índice inválido que satisfaria a busca).
- **Décima tabela, não nona:** a lista de nove do relatório foi levantada num banco onde `sync_outbox` não existia — o mesmo drift do achado colateral de PROB-0072. Com os objetos restaurados, a varredura acusa **dez**. `sync_outbox` ficou **isenta com justificativa escrita** em `ISENTAS_DE_UNIQUE_TENANT_ID`, não incluída na `0036`: `drain_sync_outbox()` (`0008:83-92`) apaga TODAS as linhas a cada pull movendo-as para `sync_changes`, então ser alvo de FK é impossível por construção — não improvável. O índice seria custo puro de INSERT no caminho de escrita mais quente do sistema (trigger em seis tabelas). A seção também reprova **isenção obsoleta**, para a lista não virar depósito.
- **Evidência de fechamento (2026-07-29):** `db:verify` **antes** da `0036` reprovou exatamente as nove + `ISENTA sync_outbox`; depois, `0 tabela(s) sem o índice, 1 isenta(s)` e `OK: schema íntegro` no banco descartável `renowa_fix` (provisionado do zero) e no banco de dev.
- **Próximo passo:** nenhum.
- **Relacionado:** PROB-0011, PROB-0012, BACKLOG-0006, BACKLOG-0048, BACKLOG-0052

### PROB-0074 — Push de sync altera pedido externo sem passar pela guarda de origem
- **Data:** 2026-07-29
- **Origem:** auditoria (fotos/pedido externo/SAC)
- **Severidade:** HIGH
- **Status:** FECHADO (2026-07-29)
- **Área:** backend / segurança
- **Sintoma:** um device pode, pelo push de sync, sobrescrever `total_sem_imposto`, `total_com_imposto` e `status` de um pedido **externo**, sem nenhuma das guardas que o caminho HTTP aplica.
- **Causa raiz:** confirmada. `assertOrigem` (`backend/src/orders/orders.service.ts:257`) tem exatamente dois call sites — `:224` (`updateExternal`) e `:283` (`update`) —, ambos HTTP. O sync escreve em `pedidos` por SQL cru, sem passar pelo `OrdersService` (`backend/src/sync/sync.service.ts:317-333` no v2, `:328-350` no v1), e a allowlist `writableFields` (`backend/src/sync/sync-entity-policy.ts:53-56`) inclui `status`, `total_sem_imposto` e `total_com_imposto`. Nada consulta `origem` antes de gravar.
- **Impacto técnico:** (a) rompe a invariante `total_sem_imposto = total_com_imposto = valor` que `createExternal`/`updateExternal` mantêm (`orders.service.ts:194-195`, `:243-244`) e que a fila de faturamento lê; (b) `total_com_imposto: null` num pedido externo viola `pedidos_origem_externa_check` — `NOT VALID` isenta linhas legadas, **não escritas novas** — e o `23514` vaza como falha crua de item de sync, não como 400 semântico; (c) permite gravar `liberado`/`faturado`/`cancelado` sem a permissão `pedidos.liberar` (o sync exige só `pedidos.editar`, `sync-entity-policy.ts:52`) e sem a máquina de estados, tendo como única barreira o CHECK de enum, que valida o **valor** e não a **transição**; (d) `updateExternal` recusa editar fora de `em_aberto` (`orders.service.ts:227-229`) e o sync não tem esse gate.
- **Arquivos/módulos:** `backend/src/sync/sync.service.ts:317-333`, `:328-350`, `:365-379`, `:400-409`; `backend/src/sync/sync-entity-policy.ts:50-72`; `backend/src/orders/orders.service.ts:224`, `:257`, `:283`
- **Solução proposta:** duas abordagens em `docs/REVIEW_REPORTS/2026-07-29_audit_fotos-pedido-externo-sac.md` §6.4 — ler `origem` antes do UPDATE e rejeitar, ou (preferível) dar à `SyncEntityPolicy` um gancho que derive a allowlist da linha corrente, mantendo a regra num só lugar e criando o mecanismo que PROB-0065 vai exigir de qualquer forma.
- **Solução aplicada:** nenhuma ainda.
- **Evidências/comandos:** `grep -n "assertOrigem" backend/src/orders/orders.service.ts` → apenas `:224`, `:257`, `:283`. Leitura de `sync.service.ts` e `sync-entity-policy.ts`. Nota: a allowlist **de fato barra** `origem`/`numero_pedido_externo`/`sistema_origem` (rejeição em `:365-379`, projeção em `:400-409`) — a lacuna não é escrever `origem`, é escrever os demais campos num pedido que já é externo. `serverControlledFields` **não é lido em runtime** por nenhum arquivo de `backend/src/sync/`; só pelo teste `sync.service.spec.ts:250-262`.
- **Riscos residuais:** o gate de `status` continua sendo assunto de PROB-0065 — o sync não deveria escrever `status` direto para **nenhuma** origem.
- **Solução aplicada (2026-07-29):** abordagem do gancho na policy. `SyncEntityPolicy` ganhou `writableFieldsFor?: (row) => readonly string[]`, e a policy de `pedidos` deriva a allowlist de `origem`, removendo `status`, `total_sem_imposto` e `total_com_imposto` quando `origem = 'externo'`. Sem janela TOCTOU: `origem` é escrita na criação (`orders.service.ts:143` e `:189`) e nunca atualizada.
- **Validação em duas passadas, não uma:** mover a validação para depois do SELECT — como o esboço sugeria — fez payload malformado pagar uma ida ao banco, e a suíte cobria justamente isso (`expect(query).not.toHaveBeenCalled()`). Ficou: `validatePayload` antes do SELECT, contra a lista base (campo desconhecido e campo controlado pelo servidor morrem sem tocar no banco), e `assertCamposDaForma` depois, só para campos válidos na entidade mas não **nesta forma** do registro. Aplicado nos dois caminhos — `processItemV2` e `processItem` (v1), cuja projeção passou a trazer `origem` e `status`.
- **Gate de edição:** `assertOrigemEditavel` recusa UPDATE de pedido externo fora de `em_aberto`, em paridade com `updateExternal` (`orders.service.ts:225-227`). No v2 cai no ramo já existente de `processIdempotentItemV2` (`sync.service.ts:86-96`), que classifica `BadRequestException` como `status: 'rejected'`, `code: 'VALIDATION_FAILED'`, `retryable: false` — nenhum código de classificação novo foi necessário.
- **`serverControlledFields` deixou de ser decorativo:** o campo não era lido em runtime por arquivo nenhum de `backend/src/sync/`, só pelo teste. `validatePayload` passou a rejeitá-lo com mensagem própria (`Campos controlados pelo servidor não podem vir no push de pedidos: numero_pedido`), distinta da de campo inexistente. Risco baixo — a allowlist já barrava —, muda a mensagem e a origem da barreira. Dois casos do spec foram atualizados: asseravam a frase genérica.
- **Mudança observável de contrato:** o push passa a **rejeitar** o que hoje aceita em silêncio. É o comportamento correto, mas clientes que enviavam esses campos em pedido externo passam a receber erro. `mobile/` não foi alterado nem validado, por escopo.
- **Evidência de fechamento:** `npm test --workspace=backend -- sync` → 79 passed, com 9 casos novos cobrindo v1 e v2: rejeição de `status`/`total_sem_imposto`/`total_com_imposto` em pedido externo, `status` ainda gravável em pedido **interno** (para não fechar PROB-0065 por acidente), recusa de edição fora de `em_aberto`, CREATE via sync intacto, e a projeção do v1 trazendo `origem` e `status`.
- **Próximo passo:** nenhum. O mecanismo `writableFieldsFor` é o que PROB-0065 vai usar.
- **Supersessão (2026-07-31):** o mecanismo introduzido aqui (`writableFieldsFor` + `assertCamposDaForma`) foi **removido** ao fechar PROB-0065, e isso NÃO reabre este problema: `status` e os totais deixaram de ser entrada para **toda** origem, num gate mais cedo e sem ida ao banco, então a allowlist condicional por origem ficou sem o que decidir. Gancho ligado a função identidade seria peso morto. O gate de edição fora de `em_aberto` também deixou de ser exclusivo do pedido externo. Ver FIX-0027.
- **Relacionado:** PROB-0065, BACKLOG-0005

### PROB-0075 — Purga LGPD (ERASURE) não alcança `pedido_fotos` nem as tabelas de SAC, e a migration documenta o contrário
- **Data:** 2026-07-29
- **Origem:** auditoria (fotos/pedido externo/SAC)
- **Severidade:** HIGH
- **Status:** FECHADO (2026-07-29)
- **Área:** LGPD / backend
- **Sintoma:** depois de um ERASURE de cliente **concluído com sucesso**, o binário das fotos do pedido continua íntegro em `pedido_fotos.conteudo` e servível pelo endpoint de conteúdo; `chamados_sac.observacao`, `chamados_sac.numero_nfe` e `itens_chamado_sac.motivo` também sobrevivem.
- **Causa raiz:** confirmada. `backend/src/privacy/privacy.service.ts:69-98` é SQL literal, não dirigido por metadata: toca `clientes` + `pedidos` (4 colunas) no ramo CLIENT, e `usuarios` + `local_users` + `refresh_tokens` + `mobile_sessions` no ramo USER. Tabela nova é omissão silenciosa por default.
- **Impacto técnico:** foto de nota fiscal ou etiqueta de entrega pode conter nome, CNPJ e endereço do titular no próprio pixel — PII que o ERASURE deveria alcançar e não alcança. No SAC é pior por desenho: `chamados_sac` tem FK direta para `clientes(tenant_id, id)` (`0035:63-68`), então o cliente vira `"Titular anonimizado ab12cd34"` enquanto o chamado segue apontando para ele com NF-e e motivos em texto livre. **Agravante documental:** `0034_pedido_fotos.sql:8-9` justifica o storage em `bytea` afirmando que "soft delete e purga LGPD já a cobrem sem job externo", e `docs/REVIEW_REPORTS/2026-07-29_fullstack_implementation_….md:59-61` repete a afirmação. O critério de aceite de BACKLOG-0051 se apoia na mesma premissa.
- **Arquivos/módulos:** `backend/src/privacy/privacy.service.ts:69-98`; `backend/src/database/migrations/0034_pedido_fotos.sql:5-9`, `:71-82`; `backend/src/database/migrations/0035_sac_chamados.sql:63-68`
- **Solução proposta:** esboço em `docs/REVIEW_REPORTS/2026-07-29_audit_fotos-pedido-externo-sac.md` §6.5. **Não é copiar e colar:** `pedido_fotos_storage_check` (`0034:71-82`) exige `conteudo IS NOT NULL` quando `storage_backend = 'db'`, então zerar o binário viola o CHECK — é preciso decidir entre um terceiro valor de `storage_backend` ou relaxar o predicado, e isso é migration. O caminho estruturalmente melhor é BACKLOG-0054 (registro executável de PII dirigindo o SQL), em vez de mais literais que a próxima tabela vai voltar a esquecer. Independentemente do código, **corrigir a afirmação falsa** no comentário da `0034` e no relatório de implementação.
- **Solução aplicada:** nenhuma ainda.
- **Evidências/comandos:** `grep -rn "pedido_fotos\|chamados_sac" backend/src/privacy/` → sem saída. Leitura integral de `privacy.service.ts` (134 linhas): as seis tabelas de dados tocadas estão em `:72`, `:78`, `:85`, `:90`, `:93`, `:94`.
- **Riscos residuais:** não existe registro executável de tabelas com PII (o inventário está em prosa em `docs/LGPD_ARCHITECTURE.md:13-18` e já omite `notas_fiscais`, `parceiros_comerciais` e `transportadoras`), não há job de retenção, e `privacy.service.ts` — único fluxo destrutivo do sistema — não tem spec. O mesmo esquecimento vai se repetir na próxima tabela.
- **Solução aplicada (2026-07-29):** o ERASURE deixou de ser SQL literal e passou a ser **gerado** a partir de `backend/src/privacy/pii-registry.ts`, que declara por tabela o vínculo até o titular (`own-uuid` / `own-id` / `via`) e a estratégia por coluna (`null` / `literal` / `marker` / `increment` / `timestamp-once`). Migration `0037_lgpd_purga_e_totais_externos.sql` abre o terceiro valor `storage_backend = 'purgado'` e o ramo correspondente em `pedido_fotos_storage_check` — sem ele, zerar `conteudo` viola o CHECK. Purgar não é o mesmo que não ter foto: a linha fica como prova de que existiu anexo, sem o conteúdo. `DELETE` físico foi descartado (apagaria a trilha) e relaxar o predicado também (devolveria a foto fantasma).
- **Tabelas novas cobertas:** `pedido_fotos` (`conteudo → NULL`, `storage_backend → 'purgado'`, `storage_key → NULL`, `nome_arquivo → marcador`, soft delete, bump de `version`), `chamados_sac` (`observacao`, `numero_nfe`) e `itens_chamado_sac` (`motivo → '[removido - LGPD]'`, literal e nunca NULL: a coluna é `NOT NULL` em `0035:90` e NULL abortaria o ERASURE inteiro com 23502).
- **Duas tabelas que a auditoria não listou** entraram por decisão do usuário, ao classificar o inventário: `inadimplencia.observacao` (texto livre sobre o devedor, ligado por `cliente_id` — mesma natureza de `pedidos.observacao`, que já era purgada) e `notas_fiscais.observacao` (alcançável pelo titular via `pedido_id`). Deixá-las de fora seria embutir o mesmo defeito no código escrito para corrigi-lo. `financeiro_movimentacao.descricao` ficou fora com justificativa: é texto livre, mas a tabela não tem vínculo com titular algum, então nenhuma solicitação a alcança.
- **`0034` NÃO foi editada, de propósito.** O plano pedia corrigir a afirmação falsa no cabeçalho dela, mas `0034` já está aplicada: reescrever o arquivo mudaria o checksum e re-dispararia exatamente o bloqueio de PROB-0072 que esta rodada acabou de destravar. A correção foi para o relatório de implementação e para `docs/LGPD_ARCHITECTURE.md`, e a `0037` explica no próprio cabeçalho o que passou a ser verdade.
- **O que impede a repetição:** `pii-registry.spec.ts` varre `backend/src/**/*.entity.ts`, extrai a tabela do decorador `@Entity(...)` e reprova a build se alguma entidade com `tenant_id` não estiver em `PII_REGISTRY` **ou** em `TABELAS_SEM_PII` — esta última exigindo justificativa escrita por entrada. Puro `fs`: roda no CI atual, sem banco.
- **Cobertura do fluxo destrutivo (m6):** `privacy.service.spec.ts` foi criada **antes** do refactor, assertando o SQL emitido para as seis tabelas já cobertas (`clientes`, `pedidos`, `usuarios`, `local_users`, `refresh_tokens`, `mobile_sessions`), para provar equivalência em vez de prometê-la. Única mudança deliberada de comportamento: os campos da trilha de auditoria passaram a ser qualificados por tabela (`clientes.razao_social`) — a lista antiga do ramo CLIENT era só o nome da coluna, e `prazo` existe em `clientes` **e** em `pedidos`, então a trilha não dizia qual das duas fora purgada.
- **Evidência de fechamento (2026-07-29):** `npm test --workspace=backend` → 500 passed. Smoke contra PostgreSQL real (`renowa_fix`, migrado até `0037`): semeadura de cliente + pedido + foto (`bytea`) + nota fiscal + inadimplência + chamado + item, execução do SQL gerado pelo registro e sete provas em SQL — foto sem conteúdo e com `storage_backend = 'purgado'`, motivo do item substituído, observações limpas em `chamados_sac`/`notas_fiscais`/`inadimplencia`, pedido anonimizado mas **não** apagado, cliente com o marcador. Nenhum CHECK nem `NOT NULL` violado; transação revertida ao final.
- **Riscos residuais:** `parceiros_comerciais.nome_parceiro` é nome de pessoa física de um **terceiro**, que não é `CLIENT` nem `USER` — ver PROB-0076. Política de retenção continua inexistente (`pii_audit_events` cresce sem limite, não há `ScheduleModule` no backend) e a cobertura do ERASURE contra banco real segue em BACKLOG-0054.
- **Próximo passo:** PROB-0076 e o que restou de BACKLOG-0054.
- **Atualização (2026-07-31) — o ramo de fotos foi fechado por REMOÇÃO, não pela regra de purga.** A feature "foto do pedido" saiu na `0040`: `pedido_fotos` foi dropada e o modelo passou a ser **foto do produto no catálogo**, uma por produto, reaproveitada por todo pedido que o use. A regra herdada em `produto_fotos` dependia de `origem_pedido_id`, coluna preenchida **só** pelo bloco de migração da `0040` — que rodou sobre tabela vazia. Nenhum caminho de código a escrevia (`ProductPhotosService.upsert` gravava `null` sempre), então o `UPDATE ... WHERE origem_pedido_id IN (...)` **nunca casava linha nenhuma**: o inventário declarava um controle que não existia. Pior, se a coluna voltasse a ser preenchida, o ERASURE de UM cliente apagaria a foto de catálogo que os pedidos de todos os outros também usam. A migration `0042_produto_fotos_sem_origem_pedido.sql` dropou a coluna e a FK, com guarda que **aborta** a migration se existir linha com `origem_pedido_id` não nulo; `produto_fotos` passou de `PII_REGISTRY` para `TABELAS_SEM_PII`, com justificativa. O risco que sobra — binário de catálogo podendo conter PII sem caminho de expurgo — está em PROB-0083.
- **Relacionado:** BACKLOG-0051, BACKLOG-0054, BACKLOG-0055, PROB-0076, PROB-0083

### PROB-0076 — `parceiros_comerciais.nome_parceiro` guarda PII de terceiro sem tipo de titular nem caminho de apagamento
- **Data:** 2026-07-29
- **Origem:** implementação (registro executável de PII, PROB-0075)
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** LGPD / banco
- **Sintoma:** `parceiros_comerciais.nome_parceiro` é nome de **pessoa física** — um parceiro comercial que não é cliente nem usuário do sistema. Não existe solicitação LGPD que alcance esse dado: nem apagamento, nem portabilidade.
- **Causa raiz:** confirmada. `lgpd_requests_subject_type_check` (`0011`) aceita apenas `'CLIENT'` e `'USER'`. O parceiro não é nenhum dos dois, então não há `subject_type` que o represente e nenhum `subject_uuid` que o identifique — `create` em `privacy.service.ts:27` resolve o titular em `clientes` ou `usuarios`, e o parceiro não está em nenhuma das duas.
- **Impacto técnico:** o titular desse dado não tem como exercer apagamento nem portabilidade pelo sistema. Diferente de PROB-0075, **não** é uma tabela esquecida por um ERASURE que existe — é a ausência do próprio tipo de titular. Corrigir exige decidir se o parceiro é titular no modelo, o que muda o CHECK de `subject_type`, a resolução de titular e a UI de solicitações.
- **Arquivos/módulos:** `backend/src/privacy/pii-registry.ts` (entrada em `TABELAS_SEM_PII`, com esta ressalva explícita), `backend/src/database/migrations/0011_lgpd_requests.sql`, `backend/src/privacy/privacy.service.ts:27`
- **Solução proposta:** decisão de negócio antes de código. Caminhos: (a) tratar parceiro como terceiro tipo de titular, com migration no CHECK e resolução própria; (b) declarar que a coluna não deve guardar nome de pessoa física e tratá-la como razão social, restringindo na entrada; (c) aceitar o risco formalmente, com base legal registrada. Apagar por carona numa solicitação de outro titular foi descartado nesta rodada: apagaria dado de alguém que não pediu.
- **Solução aplicada:** nenhuma. A tabela está declarada em `TABELAS_SEM_PII` **com a ressalva escrita de que não é isenção**, para que a classificação não vire silêncio — é o oposto do que causou PROB-0075.
- **Evidências/comandos:** `information_schema.columns` de `parceiros_comerciais` → `nome_parceiro`, `empresa_parceiro`, `cliente_id`, `fornecedor_id`, além de valores e datas. `SELECT ... FROM pg_constraint WHERE conname = 'lgpd_requests_subject_type_check'` → `subject_type = 'CLIENT'::text` no CHECK esperado por `verify-schema.ts`.
- **Riscos residuais:** enquanto ABERTO, o inventário de PII está completo e honesto, mas a cobertura não. `docs/LGPD_ARCHITECTURE.md` registra o limite na seção "Limite conhecido".
- **Próximo passo:** decisão do usuário sobre (a)/(b)/(c).
- **Relacionado:** PROB-0075, BACKLOG-0054

### PROB-0077 — Foto do pedido persiste indefinidamente no banco, contrariando o requisito original — ressalva aceita por decisão do usuário
- **Data:** 2026-07-29
- **Origem:** revisão (reverificação independente das três frentes)
- **Severidade:** MEDIUM
- **Status:** FECHADO_COM_RESSALVA — **decisão do usuário: manter como está.** Nada pendente de código; a entrada existe para que o desvio esteja escrito.
- **Área:** LGPD / banco
- **Sintoma:** o requisito original da feature de fotos dizia que "a imagem não fica salva em nosso sistema". Não é o que o sistema faz: a foto é gravada como `bytea` em `pedido_fotos.conteudo`, **sem TTL** e sem nenhum job de expurgo por idade.
- **Causa raiz:** confirmada, e é de design, não defeito. O armazenamento em banco foi decisão deliberada (registrada no cabeçalho da migration `0034`: zero infra nova, mesmo backup e mesma transação do pedido). O que ninguém fechou foi o ciclo de vida: **nem o soft delete da foto nem o do pedido apagam os bytes** — o soft delete só marca `deleted_at`. O único caminho que zera o binário é o ERASURE da LGPD (`backend/src/privacy/pii-registry.ts:89-106`), que zera `conteudo`/`storage_key`, marca `storage_backend = 'purgado'` e substitui `nome_arquivo`, deixando a linha como prova de que houve anexo.
- **Impacto técnico:** (a) o requisito de negócio está formalmente **não cumprido**; (b) foto de nota fiscal traz nome, CNPJ e endereço **no pixel**, então o banco acumula PII por prazo indeterminado, sem base de retenção declarada — a política de retenção segue inexistente (BACKLOG-0054); (c) o volume de `pedido_fotos` cresce monotonicamente, hoje limitado só pelo teto de 3 MB por foto, 10 fotos por pedido e o downscale no cliente.
- **Arquivos/módulos:** `backend/src/database/migrations/0034_pedido_fotos.sql`, `backend/src/privacy/pii-registry.ts:89-106`, `backend/src/orders/order-photos.service.ts`, `backend/src/orders/orders.service.ts` (cascata do soft delete)
- **Solução proposta:** nenhuma a executar. Se a decisão for revista, os caminhos são: (a) apagar os bytes no soft delete da foto e do pedido, mantendo a linha como metadado — é a mudança mais barata e mais alinhada ao requisito; (b) job de retenção por idade, que hoje não tem onde morar (não há `ScheduleModule` no backend); (c) mover para bucket com lifecycle rule, que é BACKLOG-0051 e **não** resolve por si — o expurgo do objeto remoto teria de ser escrito à mão nos dois fluxos.
- **Solução aplicada:** nenhuma, **por decisão explícita do usuário nesta rodada**. Registrado como ressalva para não voltar como surpresa numa auditoria de privacidade nem numa conversa sobre volume de banco.
- **Evidências/comandos:** leitura de `pii-registry.ts:89-106` (único ponto que zera `conteudo`) e da cascata de soft delete em `orders.service.remove`, que marca `deleted_at` nas fotos e **não** toca no binário.
- **Riscos residuais:** o requisito segue descumprido e a PII segue sem prazo. O risco é de conformidade, não funcional.
- **Próximo passo:** nenhum. Reabrir só se a decisão mudar.
- **Relacionado:** PROB-0075, BACKLOG-0051, BACKLOG-0054, [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md)

### PROB-0078 — Chamado SAC não registra autoria, e `findAll`/`findOne` do SAC não têm escopo de ownership de vendedor
- **Data:** 2026-07-29
- **Origem:** revisão (reverificação independente das três frentes)
- **Severidade:** MEDIUM hoje; vira **HIGH** no momento em que `sac.ver` for concedido a `vendedor`, o que **não exige código**
- **Status:** ABERTO — **adicionar autoria é escopo novo; aguarda decisão do usuário.**
- **Área:** backend / segurança
- **Sintoma:** `chamados_sac` não tem `created_by`/`usuario_id`: não há como saber quem abriu um chamado. E `findAll`/`findOne` do `SacService` filtram só por `tenant_id` + `deleted_at`, sem o escopo de ownership que o módulo de pedidos aplica a vendedor (`orders/order-ownership.ts`, reusado até pelo serviço de fotos).
- **Causa raiz:** confirmada. As duas coisas se combinam: sem coluna de autoria, **não existe** o dado pelo qual filtrar, então o escopo de ownership não é uma linha esquecida — é impossível de escrever hoje.
- **Impacto técnico:** latente **apenas** porque `vendedor` não recebeu nenhum slug `sac.*` (concessão fail-closed a `admin`/`gestao`; BACKLOG-0050). A tela de Perfis permite conceder `sac.ver` a qualquer papel **sem tocar em código**: no instante em que isso acontecer, todo vendedor passa a ver os chamados de **todos** os vendedores do tenant, sem nenhum filtro por autor. Não é vazamento cross-tenant — o `tenant_id` continua aplicado —, é ausência de compartimentação intra-tenant, exatamente o que o módulo de pedidos tem e o SAC não. Efeito colateral independente: sem autoria não há trilha de quem abriu o chamado, nem para auditoria nem para atribuição de atendimento.
- **Arquivos/módulos:** `backend/src/sac/sac.service.ts` (`findAll`, `findOne`), `backend/src/sac/entities/sac-ticket.entity.ts`, `backend/src/database/migrations/0035_sac.sql`, referência do padrão a seguir em `backend/src/orders/order-ownership.ts`
- **Solução proposta:** migration aditiva com `created_by` (FK composta `(tenant_id, usuario_id)`, como o resto do schema exige), preenchimento a partir do `RequestUser` no `create`, e escopo de ownership em `findAll`/`findOne` espelhando `order-ownership.ts`. Decisões que **precisam vir antes do código**: o vendedor deve ver só os chamados que abriu, ou todos os do cliente que atende? Chamados existentes ficam sem autoria (`NULL`) — e um `NULL` deve ser visível a quem? Editar chamado de outro autor é permitido a `gestao`?
- **Solução aplicada:** nenhuma. Nesta rodada só foi diagnosticado e registrado.
- **Evidências/comandos:** leitura de `sac.service.ts` (`findAll`/`findOne` sem chamada a nada de ownership, ao contrário de `orders.service.ts`) e da entity/migration do SAC, sem coluna de autoria. Confirmado que `vendedor` não tem `sac.*` no catálogo — é o que mantém o problema latente.
- **Riscos residuais:** enquanto ABERTO, a segurança do módulo depende de **ninguém conceder `sac.ver` pela tela de Perfis** sem ler este registro. É proteção por desconhecimento, não por mecanismo.
- **Próximo passo:** decisão do usuário sobre as três perguntas acima, e só então implementação. Se a concessão de BACKLOG-0050 for decidida primeiro, **este item passa a ser bloqueador dela**.
- **Relacionado:** BACKLOG-0050, [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md)

### PROB-0079 — Mobile fora de paridade com pedido externo: schema SQLite sem as três colunas, v2 descarta em silêncio e v1 quebraria
- **Data:** 2026-07-29
- **Origem:** revisão (reverificação independente das três frentes)
- **Severidade:** MEDIUM
- **Status:** ABERTO — **`mobile/` não pode ser tocado nesta sessão** (`AGENTS.md`).
- **Área:** mobile / backend
- **Sintoma:** `mobile/src/storage/database.ts:95-115` declara a tabela `pedidos` local **sem** `origem`, `numero_pedido_externo` e `sistema_origem`. O pedido externo existe no servidor desde a migration `0033` e não existe no aparelho.
- **Causa raiz:** confirmada. Duas consequências distintas, por caminho de código: no **v2** (`mobile/src/services/SyncService.ts:230-251`) o `applyPage` lê `PRAGMA table_info` e filtra as chaves por `allowed` — os três campos são **descartados em silêncio**, sem erro e sem log; no **v1** (`:261-311`, hoje **código morto**) o INSERT é montado com as chaves do payload sem filtro, e quebraria com `no such column: origem` se voltasse a ser usado.
- **Impacto técnico:** um pedido externo puxado para o aparelho chega como pedido **interno sem itens**, com `origem` ausente. O operador vê um pedido de valor zero em itens e não tem como distinguir; qualquer regra local que dependa de `origem` (hoje nenhuma, no futuro qualquer uma) parte de dado errado. O gate de origem no push (`writableFieldsFor`, FIX-0003/PROB-0074) protege o servidor de escrita indevida, então o risco é de **leitura enganosa no cliente**, não de corrupção no servidor. Reativar o v1 sem a migration local é falha dura.
- **Arquivos/módulos:** `mobile/src/storage/database.ts:95-115`, `mobile/src/services/SyncService.ts:230-251` (v2), `mobile/src/services/SyncService.ts:261-311` (v1, código morto)
- **Solução proposta:** migration do schema SQLite local acrescentando as três colunas, mais decisão de produto sobre o que o app **mostra** para pedido externo (hoje o formulário e a lista assumem itens). Sessão própria, com o mobile em escopo. O filtro por `allowed` no v2 deve continuar existindo, mas **logar** o descarte em vez de silenciar — foi o silêncio que deixou isso passar por três leituras.
- **Solução aplicada:** nenhuma. `AGENTS.md` proíbe alterar `mobile/` nesta sessão, e **nenhum item de backlog cobria isso** antes deste registro.
- **Evidências/comandos:** leitura direta do `CREATE TABLE IF NOT EXISTS pedidos` em `database.ts` (colunas conferidas uma a uma: as três não estão) e dos dois caminhos de `SyncService` — o v2 com `allowed = new Set(columns.map(...))` filtrando as chaves, o v1 sem filtro.
- **Riscos residuais:** enquanto ABERTO, todo pedido externo puxado para o mobile é indistinguível de interno. Não há alerta em nenhum dos dois lados.
- **Próximo passo:** sessão com `mobile/` em escopo, depois da decisão de produto sobre a apresentação. Delegar a quem toca mobile.
- **Relacionado:** PROB-0074, PROB-0065, [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md)

### PROB-0080 — Comissão de pedido externo grava o `numero_pedido` interno e não reconcilia com o sistema de origem
- **Data:** 2026-07-29
- **Origem:** revisão (reverificação independente das três frentes)
- **Severidade:** MEDIUM
- **Status:** ABERTO
- **Área:** backend / frontend
- **Sintoma:** ao emitir nota contra um pedido **externo**, a comissão gerada guarda em `numero_pedido` o número **interno** da `pedidos_numero_seq` (`backend/src/faturamento/faturamento.service.ts:200`). Na tela de financeiro não há como cruzar a comissão com o pedido no sistema de origem: o número que o operador conhece — `numero_pedido_externo` — não aparece em lugar nenhum daquele fluxo.
- **Causa raiz:** confirmada, e é herança direta da decisão de design do pedido externo: ele vive na **mesma** tabela `pedidos` e consome a **mesma** sequence, justamente para herdar o ciclo comercial sem alterar o `FaturamentoService`. A comissão copia `order.numero_pedido` sem saber que existem duas origens.
- **Impacto técnico:** conciliação manual entre a comissão registrada aqui e o pedido no sistema de terceiro. Não há erro de cálculo nem de valor — é rastreabilidade. Piora com volume: quanto mais pedidos externos, mais linhas de comissão sem chave reconhecível pelo operador.
- **Arquivos/módulos:** `backend/src/faturamento/faturamento.service.ts:200`, entity `Commission`, telas de financeiro/comissões
- **Solução proposta:** três caminhos, e a escolha é de negócio. (a) Coluna nova na comissão para o número de origem — aditiva, preserva o histórico, exige migration e ajuste de tela; (b) exibir o número de origem na tela lendo do pedido pela FK que **já existe** (`comissoes.pedido_id`) — nenhuma migration, só frontend e o service que monta a listagem; é a mais barata; (c) gravar o número de origem no próprio `numero_pedido` quando externo — **descartada**: o campo passaria a significar duas coisas e quebraria qualquer busca por número interno.
- **Solução aplicada:** nenhuma. A rodada corrigiu a **fila de faturamento**, que agora expõe `origem`/`sistema_origem`/`numero_pedido_externo` (FIX-0018), mas a **comissão** não foi tocada.
- **Evidências/comandos:** leitura de `faturamento.service.ts:200` (`numero_pedido: order.numero_pedido !== null ? String(order.numero_pedido) : null`), sem ramo para origem externa.
- **Riscos residuais:** enquanto ABERTO, a conferência de comissão de pedido externo depende de o operador lembrar do vínculo.
- **Próximo passo:** decisão entre (a) e (b). Recomendação: (b), por não exigir migration nem tocar em dado histórico.
- **Relacionado:** FIX-0018, [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md)

### PROB-0081 — Filtros `status` e `origem` nas listas de pedidos e SAC devolviam 400 antes de chegar ao service
- **Data:** 2026-07-29
- **Origem:** teste (suíte do roteiro na aba logada do Safari)
- **Severidade:** BLOCKER
- **Status:** FECHADO
- **Área:** backend
- **Sintoma:** `GET /pedidos?origem=externo`, `GET /pedidos?status=faturado` e `GET /sac?status=aberto` respondiam **400** com `property origem should not exist` (idem `status`). Na tela, escolher o filtro Origem em `/pedidos` imprimia **"Ocorreu um erro"** — a mensagem genérica do `ErrorState`, porque `usePaginatedQuery` descarta a mensagem da API. `search` funcionava, o que fazia o defeito parecer intermitente.
- **Causa raiz:** confirmada. As rotas de lista declaravam `@Query() pagination: PaginationDto` **e** `@Query('status')` / `@Query('origem')` soltos. O `@Query()` sem chave faz o ValidationPipe global validar o objeto de query **inteiro** contra aquele DTO, e com `whitelist: true` + `forbidNonWhitelisted: true` (`main.ts`) todo parâmetro ausente do DTO derruba a requisição — inclusive os que a própria rota declarava por chave. `PaginationDto` só tinha `page`, `limit` e `search`; por isso `search` passava e os filtros não.
- **Impacto técnico:** os dois filtros de `/pedidos` e o de `/sac` estavam inutilizáveis pela API e pela tela. **Consequência colateral, e a mais grave:** a validação de enum dos services (`orders.service.ts`, `sac.service.ts`) era **inalcançável por HTTP**, então os testes de roteiro "enum inválido → 400" passavam pelo motivo errado — o 400 vinha do whitelist. FIX-0014 não estava provado.
- **Arquivos/módulos:** `backend/src/orders/orders.controller.ts`, `backend/src/sac/sac.controller.ts`, `backend/src/common/dto/pagination.dto.ts`, `backend/src/main.ts`
- **Solução proposta:** declarar os filtros em DTOs de query que estendem `PaginationDto`, no padrão que o módulo de finance já usava, com `@IsIn` contra os enums e mensagem nomeando os valores aceitos.
- **Solução aplicada:** FIX-0020. `ListOrdersQueryDto` e `ListSacQueryDto`; os `@Query('x')` soltos saíram (inclusive o `@Query('search')` duplicado); a checagem de enum ficou no service como defesa em profundidade, agora alcançável pelo mobile/sync, que não passa pelo DTO.
- **Evidências/comandos:** antes — `GET /pedidos?origem=externo` → 400 `property origem should not exist`. Depois, na aba logada: `origem=externo` → 200 com `total=1` e toda linha com `origem: "externo"`; `origem=externa` → 400 `Origem inválida. Use um de: interno, externo.`; `status=faturadoo` → 400 `Status inválido. Use um de: em_aberto, liberado, ...`; `sac?status=resolvidoo` → 400 com a mensagem do enum; `?xpto=1` → 400 `property xpto should not exist`, provando que o whitelist não foi afrouxado. 9/9 no bloco de filtros.
- **Riscos residuais:** nenhum conhecido para estas rotas. Continua valendo que `usePaginatedQuery` troca a mensagem da API pela genérica "Ocorreu um erro" em **todas** as listas — não foi tocado nesta rodada, e é o que tornou este defeito difícil de ler na tela.
- **Próximo passo:** nenhum. Guarda de regressão em `backend/src/common/architecture/query-filter-whitelist.spec.ts`, que varre todos os controllers e tem um caso provando que o próprio guard dispara.
- **Relacionado:** FIX-0014, FIX-0020, [REVIEW_REPORTS/2026-07-29_teste-automatizado-safari.md](REVIEW_REPORTS/2026-07-29_teste-automatizado-safari.md)

### PROB-0082 — Miniatura de foto ficava em "Carregando..." para sempre quando o download falhava
- **Data:** 2026-07-29
- **Origem:** teste (suíte do roteiro na aba logada do Safari)
- **Severidade:** LOW
- **Status:** FECHADO
- **Área:** frontend
- **Sintoma:** com o endpoint de conteúdo devolvendo 404 (caminho real: foto purgada pela LGPD), as 9 miniaturas do painel ficavam em **"Carregando..."** indefinidamente. A tela afirmava um carregamento que já havia terminado em falha, e não havia como tentar de novo sem recarregar a página.
- **Causa raiz:** confirmada, e é o **efeito colateral do próprio FIX-0008**. A guarda `buscados` (um `Set` em `useRef`) marca o uuid **antes** do fetch justamente para o efeito não re-disparar em laço quando o download falha. Ela parou o laço corretamente, mas não havia estado de erro: a única condição de render era `thumbs[uuid] ? <img> : "Carregando..."`, e para o uuid que falhou `thumbs` nunca recebe entrada.
- **Impacto técnico:** cosmético, sem laço e sem custo de rede. O dano é de confiança na tela.
- **Arquivos/módulos:** `frontend/src/components/orders/OrderPhotosPanel.tsx`
- **Solução proposta:** registrar as falhas em estado (não em ref — sem re-render a tela continua mentindo) e renderizar "Indisponível" com ação de repetir.
- **Solução aplicada:** FIX-0022.
- **Evidências/comandos:** teste novo em `OrderPhotosPanel.test.tsx` — primeiro download rejeita com `{ response: { status: 404 } }`, a tela mostra "Indisponível" e **não** "Carregando..."; o clique em "Tentar de novo" refaz exatamente um download e a imagem aparece. `npm test --workspace=frontend` → 72 passed.
- **Riscos residuais:** nenhum. A guarda contra o laço continua intacta — o botão remove o uuid de `buscados` sob ação explícita do usuário, não automaticamente.
- **Próximo passo:** nenhum.
- **Relacionado:** FIX-0008, FIX-0022, [REVIEW_REPORTS/2026-07-29_teste-automatizado-safari.md](REVIEW_REPORTS/2026-07-29_teste-automatizado-safari.md)

### PROB-0083 — Foto de catálogo pode carregar PII e não tem caminho técnico de expurgo por titular
- **Data:** 2026-07-31
- **Origem:** revisão (fechamento dos P2/P3 de `ErrosAtuais.md`)
- **Severidade:** LOW
- **Status:** ABERTO (risco residual aceito, com controle declarado)
- **Área:** LGPD / frontend / banco
- **Sintoma:** nada quebra. A foto do produto é conteúdo comercial, mas nada no sistema impede alguém de fotografar uma nota fiscal, um documento ou uma etiqueta com dado de cliente e subir como foto do produto. Se isso acontecer, uma solicitação de exclusão do titular **não alcança** esse binário.
- **Causa raiz:** confirmada, e é consequência do desenho, não defeito de implementação. A foto pertence ao **produto**, não a um pedido nem a um cliente: uma só por produto, reaproveitada por todo pedido que o use, de clientes diferentes. Não existe — nem pode existir sem quebrar o compartilhamento — coluna que a ligue a um titular. Purgar por titular apagaria a foto que os pedidos dos outros clientes também usam.
- **Impacto técnico:** PII fora do alcance do ERASURE, por prazo indeterminado. Impacto hoje: nenhuma foto migrada de pedido existe (a `0040` rodou sobre `pedido_fotos` vazia) e o catálogo de dev não tem foto ativa.
- **Arquivos/módulos:** `backend/src/privacy/pii-registry.ts` (entrada `produto_fotos` em `TABELAS_SEM_PII`); `frontend/src/components/products/ProductPhotoField.tsx`; `backend/src/database/migrations/0042_produto_fotos_sem_origem_pedido.sql`
- **Solução proposta:** nenhuma correção de código resolve — a alternativa seria proibir foto de catálogo, o que mata a feature. O controle possível é **preventivo**: avisar quem sobe.
- **Solução aplicada:** aviso `role='status'` no campo de foto (visível só para quem pode subir), dizendo que a foto é do catálogo, é compartilhada por todos os pedidos e **não** é alcançada por solicitação de exclusão — portanto não subir nota fiscal, documento ou foto com dado de cliente. Somado aos limites que já existiam: uma foto por produto, teto de 3 MB, `downscaleImage` no cliente e whitelist de mime por **magic bytes** (SVG recusado de propósito). A isenção em `TABELAS_SEM_PII` carrega a justificativa por escrito, e `pii-registry.spec.ts` continua obrigando toda tabela com `tenant_id` a estar classificada de um dos dois lados.
- **Evidências/comandos:** `npm test --workspace=frontend` → 17 arquivos, 109 passed (dois casos novos em `ProductPhotoField.spec.tsx`: o aviso aparece para quem pode subir e **não** aparece para quem não pode). `npm test --workspace=backend` → 56 suítes, 602 passed, 1 skipped, incluindo o caso que prova que o ERASURE de CLIENT não emite comando algum para `produto_fotos`.
- **Riscos residuais:** o aviso é um controle **humano**. Se alguém ignorar, a PII entra e fica. Não existe política de retenção nem varredura de conteúdo. Se um dia a foto voltar a nascer de um pedido, a tabela precisa voltar ao `PII_REGISTRY` — está escrito na própria justificativa da isenção.
- **Próximo passo:** nenhum planejado. Reavaliar se surgir política de retenção (BACKLOG-0054) ou se o vínculo foto↔pedido for reintroduzido.
- **Relacionado:** PROB-0075, PROB-0077, BACKLOG-0054, BACKLOG-0076, FIX-0026, [REVIEW_REPORTS/2026-07-31_fix_foto-de-catalogo-sem-titular-e-qa-sem-fase-morta.md](REVIEW_REPORTS/2026-07-31_fix_foto-de-catalogo-sem-titular-e-qa-sem-fase-morta.md)
