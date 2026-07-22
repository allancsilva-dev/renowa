# BACKLOG — Renowa

Próximos passos e itens não tratados agora. Mantido pelo `docs-reporter`. IDs `BACKLOG-NNNN`. Referência cruzada com [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) por ID.

**Estado atual (2026-07-21, pós revisão do Dashboard/Financeiro): 13 itens não fechados (ABERTO/EM_ANDAMENTO/PARCIALMENTE_RESOLVIDO/FECHADO_COM_RESSALVA).** Relatórios, planos e prompts em outros arquivos são históricos; execução deve partir deste backlog e do `PROBLEM_LEDGER.md`.

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
- **Status:** FECHADO
- **Decisão:** encerrado por decisão explícita do usuário em 2026-07-12; riscos residuais aceitos.
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
- **Tentativa de validação em:** 2026-07-12
- **Evidência operacional:** `docker compose -f docker-compose.prod.yml config --quiet` passou, mas PostgreSQL real não pôde ser iniciado porque o Docker daemon local estava desligado (`pipe/docker_engine` inexistente). Não há evidência nova de catálogo, SQLSTATE `23503` ou locks; item permanece aberto.
- **Relacionado:** PROB-0011, PROB-0012, PROB-0026

### BACKLOG-0007 — Programa de conformidade LGPD
- **Prioridade:** P1
- **Área:** LGPD
- **Motivo:** sem erasure/anonimização, sem trilha de auditoria de PII, PII em cleartext no mobile (PROB-0030/0031/0032).
- **Dependências:** definição jurídica dos requisitos de titular.
- **Critério de aceite:** fluxo de anonimização/hard-delete por titular; audit log de acesso/alteração de PII; DB mobile criptografado; export/portabilidade avaliado.
- **Risco se ficar pendente:** não conformidade com LGPD (Arts. 18, 37, 46).
- **Status:** ABERTO
- **Atualizado em:** 2026-07-12
- **Implementado no backend/frontend:** state machine administrativa; anonimização idempotente de clientes e usuários; limpeza de textos livres associados; revogação de refresh/mobile sessions; incremento de `access_token_version`; anonimização e desativação do espelho `local_users`; audit log tenant-scoped sem valores de PII; exportação JSON; tela administrativa e autorização ADMIN.
- **Saldo:** homologação jurídica da matriz de retenção e smoke test PostgreSQL real. Criptografia SQLite permanece fora do escopo vigente por pertencer ao mobile.
- **Relacionado:** PROB-0030, PROB-0031, PROB-0032

### BACKLOG-0008 — Varredura de robustez e limpeza de código morto
- **Prioridade:** P2
- **Área:** backend / frontend / mobile
- **Motivo:** saldo de robustez após fechamento de RBAC, auth duplicada e itens LOW web/backend. Precisão decimal de PROB-0036 foi resolvida no backend/frontend; restam itens mobile.
- **Dependências:** nenhuma.
- **Critério de aceite:** poison-items com dead-letter; mutex no `SyncService`; precisão decimal padronizada.
- **Risco se ficar pendente:** acúmulo de débito técnico e superfícies frágeis.
- **Status:** ABERTO
- **Atualizado em:** 2026-07-12
- **Implementado no backend/frontend:** contrato decimal usa strings para `NUMERIC`; cálculos financeiros usam `decimal.js`, precisão 40 e `ROUND_HALF_UP`; valores monetários são normalizados para duas casas; percentuais e quantidades preservam escala; frontend evita somas e percentuais via ponto flutuante; testes cobrem `0.10 + 0.20`, arredondamento e valor grande.
- **Saldo:** poison-items/dead-letter e mutex pertencem ao workspace mobile e seguem intocados.
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
- **Implementado:** rotação de refresh transacional com `FOR UPDATE`, graça de 10s e detecção de reuse; HS256 explícito; senha mínima de 12 caracteres com complexidade; shutdown hooks; pool TypeORM explícito; advisory lock já usado no runner; endpoints separados de liveness/readiness; readiness executa `SELECT 1` e retorna `503` sem DB; HSTS/CSP/Permissions-Policy no nginx; CORS fail-fast em produção; access token carrega `access_token_version` e o guard revalida usuário ativo/versão no DB; logout, senha, papel, desativação e anonimização invalidam tokens; throttler usa Redis compartilhado obrigatório em produção; compose inclui Redis persistente com healthcheck; ESLint e CI `lint + test + build` instalados para backend/frontend.
- **Evidências:** backend lint passou; suíte completa `28 suites / 160 testes` passou; builds backend/frontend passaram; frontend lint passou com um warning não bloqueante de Fast Refresh; `docker compose -f docker-compose.prod.yml config --quiet` e `git diff --check` passaram.
- **Saldo:** estratégia operacional de rotação de segredos, contrato/teste de soft-deleted no sync e smoke tests reais com PostgreSQL/Redis. Docker daemon local estava desligado durante a tentativa operacional.
- **Resolvido fora deste backlog:** PROB-0040 fechado em 2026-07-12; optimistic concurrency aplicada às edições web. Mobile/sync permanece em PROB-0022/BACKLOG-0005.
- **Relacionado:** PROB-0037, PROB-0038, PROB-0039, PROB-0041, PROB-0032

### BACKLOG-0010 — Implementar edição de itens de pedido depois de criado
- **Prioridade:** P0
- **Área:** backend / frontend
- **Motivo:** correção desta rodada (PROB-0046) resolveu "pedido nasce sem itens" na criação, mas o backend só expõe `PATCH /pedidos/:uuid/status` — não existe endpoint para alterar itens (produto, quantidade, preço, desconto) de um pedido já criado. Usuário que errar um item no cadastro não tem caminho de correção pela UI.
- **Dependências:** decidir contrato do endpoint de update de itens (substituir lista inteira vs. patch por item; interação com optimistic concurrency de `Order`, ver PROB-0040); confirmar com o dono do produto a fórmula de cálculo de `total_item` (ver ressalva de PROB-0046) antes ou junto desta implementação.
- **Critério de aceite:** endpoint backend de update de itens de pedido (respeitando tenant, ownership de vendedor de PROB-0044 e versionamento otimista); tela `PedidoDetalhe.tsx` permite editar itens; testes cobrindo sucesso, conflito de versão e vendedor não-dono.
- **Risco se ficar pendente:** erro de cadastro em pedido só é corrigível recriando o pedido (ou via acesso direto ao banco) — atrito operacional e risco de dado incorreto persistir em produção.
- **Status:** ABERTO
- **Relacionado:** PROB-0046, PROB-0044, PROB-0040

### BACKLOG-0011 — Clique-through autenticado real das telas novas (Fornecedores, criação de pedido com itens)
- **Prioridade:** P1
- **Área:** frontend / backend
- **Motivo:** PROB-0045 (Fornecedores) e PROB-0046 (criação de pedido com itens) foram verificados nesta rodada só por build/lint e leitura de código — o banco de dev local está vazio e não há endpoint de auto-registro, então não foi possível logar como usuário real e percorrer os fluxos ponta a ponta no navegador.
- **Dependências:** ambiente de desenvolvimento com usuário/tenant de teste seedado (ou endpoint de auto-registro habilitado só em dev).
- **Critério de aceite:** login real na tela `Fornecedores` com criar/editar/remover fornecedor confirmado visualmente; criação de pedido com itens em `PedidoForm.tsx` gerando pedido com produto/valor corretos, conferido em `PedidoDetalhe.tsx`; total por item conferido contra a fórmula assumida (ou corrigido, se o negócio apontar fórmula diferente).
- **Risco se ficar pendente:** telas novas podem ter bugs de integração (contrato de API, formatação, estado) que build/lint/testes unitários não capturam; risco maior concentrado no cálculo de `total_item` de pedidos, ainda não validado com o negócio.
- **Status:** FECHADO_COM_RESSALVA
- **Atualizado em:** 2026-07-21
- **Solução aplicada:** clique-through real feito no Safari (via osascript) com usuário admin seedado localmente (`backend/scripts/create-admin.ts`) e permissões seedadas manualmente a partir de `0000_baseline.sql:1496-1520` (banco de dev estava vazio — ver BACKLOG-0012). CRUD de fornecedor confirmado visualmente (criar/editar/remover, campo `razao_social`+`cnpj` com máscara). Criação de pedido com itens confirmada (cliente+produto+quantidade+preço), total client-side conferiu com o total do backend no cenário testado, detalhe do pedido e troca de status funcionando. Nesse processo foram encontrados e corrigidos 3 bugs novos que só um navegador real revela — ver PROB-0049/0050/0051.
- **Saldo:** a fórmula de `total_item` (PROB-0046) continua **não confirmada com o dono do produto** — o teste manual só provou que cliente e servidor concordam entre si, não que a fórmula está correta para o negócio.
- **Relacionado:** PROB-0045, PROB-0046, PROB-0049, PROB-0050, PROB-0051, BACKLOG-0012

### BACKLOG-0012 — Seed do catálogo de `permissions` em ambiente de desenvolvimento local
- **Prioridade:** P1
- **Área:** backend / infra
- **Motivo:** em dev o backend roda com `synchronize:true` (TypeORM cria schema a partir das entities) e nunca roda os arquivos `.sql` de `backend/src/database/migrations/`, que são o único lugar onde o catálogo de `permissions` é semeado (`INSERT INTO permissions`, ver `0000_baseline.sql:1496-1520`). Confirmado em 2026-07-21: banco `renowa-dev-postgres` local recém-criado tinha 0 linhas em `usuarios` e também 0 em `permissions`, deixando o painel "Permissões" de um papel (`RolesPage.tsx`) sempre vazio até o INSERT ser rodado manualmente contra o banco. Qualquer dev novo rodando local do zero vai bater nisso.
- **Dependências:** nenhuma.
- **Critério de aceite:** script ou npm-script (ex.: `scripts/seed-permissions.ts`, no mesmo padrão de `backend/scripts/create-admin.ts`) que popula o catálogo de `permissions` em dev sem depender do migration runner; documentado no fluxo de setup local (README ou doc de onboarding).
- **Risco se ficar pendente:** todo onboarding de dev novo exige descobrir e rodar manualmente o INSERT da migration baseline; tela de permissões aparenta quebrada em qualquer ambiente dev recém-criado.
- **Status:** ABERTO
- **Relacionado:** PROB-0042, BACKLOG-0004

### BACKLOG-0013 — Cobertura de teste unitário para `ResponseInterceptor`
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** PROB-0050 mostrou que a heurística "já embrulhado, não re-envolver" do `ResponseInterceptor` colide com qualquer entidade que tenha uma coluna de domínio chamada `data` (ex.: `Pedido`, `FinanceMovement`), e não existe `response.interceptor.spec.ts` cobrindo esse comportamento.
- **Dependências:** nenhuma.
- **Critério de aceite:** teste unitário cobrindo — objeto simples é envolvido em `{data}`; objeto com `data`+`meta` (shape de `PaginatedResponse<T>`) não é re-envolvido; objeto com `data` sozinho (ex.: entidade `Pedido`/`FinanceMovement`) é envolvido; `null`/`undefined` passam sem alteração; objeto com `error` passa sem alteração; objeto com `results` (resposta de sync) passa sem alteração.
- **Risco se ficar pendente:** regressão futura na heurística do interceptor só será pega em teste manual, como aconteceu com PROB-0050.
- **Status:** ABERTO
- **Relacionado:** PROB-0050, BUG-0009

### BACKLOG-0014 — Auditar outros usos de `optimisticUpdate`/`optimisticSoftDelete` quanto a retorno sem relações carregadas
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** PROB-0051 mostrou que `optimisticUpdate` devolve só a linha crua da tabela (via `UPDATE ... RETURNING *`), sem nenhuma relação — `orders.service.ts#updateStatus` retornava isso direto ao frontend, quebrando a tela porque o contrato esperado (mesmo shape de `findOne`) não era respeitado. Não foi verificado se outros métodos de escrita no backend, fora de `orders.service.ts`, têm o mesmo problema.
- **Dependências:** nenhuma.
- **Critério de aceite:** grep por `optimisticUpdate(`/`optimisticSoftDelete(` em todo o backend; para cada uso, confirmar se o retorno é consumido esperando relações carregadas e, se for, aplicar o mesmo padrão de recarregar via `findOne` (ou equivalente) antes de responder.
- **Risco se ficar pendente:** mesma classe de bug (tela quebra com dado parcial após PATCH/DELETE bem-sucedido) pode existir em outros módulos (financeiro, comissões, parceiros, inadimplência) sem ter sido descoberta ainda.
- **Status:** ABERTO
- **Relacionado:** PROB-0051, PROB-0040, BUG-0010

### BACKLOG-0015 — Resetar estado do formulário "Nova Comissão" ao reabrir (Financeiro)
- **Prioridade:** P3
- **Área:** frontend
- **Motivo:** encontrado no teste manual de 2026-07-21 (continuação): o componente `ComissaoAlune` em `frontend/src/pages/Financeiro.tsx` abre o modal "Nova Comissão" com `onClick={() => setShowForm(true)}`, sem chamar `setForm(EMPTY)` antes — diferente de `Produtos.tsx` (`openDialog()`) e `Fornecedores.tsx` (`openCreateDialog()`), que resetam o form explicitamente antes de abrir. Se o usuário abrir "Nova Comissão", cancelar sem salvar, e abrir de novo, os campos do lançamento anterior continuam preenchidos. Não é bug de dado (nada é salvo incorretamente) — é só inconsistência de UX. Não corrigido nesta sessão (baixa severidade, fora do escopo do fix aplicado).
- **Dependências:** nenhuma.
- **Critério de aceite:** botão "Nova Comissão" reseta `form` para o estado vazio antes de `setShowForm(true)`, seguindo o mesmo padrão de `openDialog()`/`openCreateDialog()` usado em `Produtos.tsx`/`Fornecedores.tsx`.
- **Risco se ficar pendente:** confusão de UX (campo com valor "fantasma" de um cadastro cancelado); nenhum risco de integridade de dado.
- **Status:** ABERTO
- **Relacionado:** —

### BACKLOG-0016 — Consolidar helper de formatação de data (`fmtDate` de `Financeiro.tsx` duplicado do `formatDate` de `lib/format.ts`)
- **Prioridade:** P3
- **Área:** frontend
- **Motivo:** PROB-0054/BUG-0012 corrigiram o shift de timezone (data exibida 1 dia a menos) em `Pedidos.tsx`/`PedidoDetalhe.tsx` criando `formatDate` em `frontend/src/lib/format.ts`, usando a mesma técnica (`new Date(value + 'T00:00:00')`) que já existia, duplicada, como helper local `fmtDate` dentro de `frontend/src/pages/Financeiro.tsx:11`. Essa duplicação é exatamente o motivo pelo qual o mesmo bug de timezone pôde existir despercebido numa terceira tela (Pedidos) depois de já ter sido corrigido numa primeira (Financeiro) — não corrigido nesta sessão por ser um refactor de baixo risco, fora do escopo do bugfix pontual.
- **Dependências:** nenhuma.
- **Critério de aceite:** `fmtDate` de `Financeiro.tsx` removido e substituído pelas chamadas a `formatDate` de `lib/format.ts`; nenhuma outra tela do frontend reimplementa a mesma lógica de formatação de data.
- **Risco se ficar pendente:** próxima tela nova que exibir uma data `YYYY-MM-DD` sem usar `lib/format.ts` pode reintroduzir o mesmo bug de timezone de PROB-0050/PROB-0054 pela quarta vez.
- **Status:** ABERTO
- **Relacionado:** PROB-0054, BUG-0012

### BACKLOG-0017 — Cobertura de teste automatizado para `getDashboard` (Financeiro) cobrindo cenários de dado real que só o smoke test manual revelou
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** a reescrita do Dashboard (PROB-0055) trocou todo o mock hardcoded por queries SQL reais em `FinanceService.getDashboard`, e um smoke test manual (não teste automatizado) encontrou 3 bugs de dado real (BUG-0013, BUG-0014, BUG-0015) que dificilmente seriam pegos por um teste unitário com dataset sintético pequeno — em especial o caso de `SUM(...)` agregando `NULL` para um cliente sem valor e invertendo `ORDER BY ... DESC` (`NULLS FIRST` do Postgres). Não existe teste dedicado a `getDashboard` cobrindo: pedido com `total_com_imposto` nulo (só `total_sem_imposto` preenchido); cliente na Curva ABC sem nenhum pedido com valor agregável concorrendo com cliente com valor real; e o cálculo de positivação/carteira com heurísticas de 90 dias/mês corrente. **Atualização 2026-07-21:** um novo smoke test de regressão encontrou mais um cenário sem cobertura — KPI `totalVendas` calculado a partir da tabela errada (`financeiro_movimentacao` em vez de `pedidos`), sempre zerado com dado real (PROB-0056/BUG-0016). Critério de aceite abaixo estendido para incluir esse cenário.
- **Dependências:** nenhuma.
- **Critério de aceite:** teste de integração ou unitário (com fixture de dados) para `FinanceService.getDashboard` cobrindo pelo menos os 3 cenários originais, mais um cenário de tenant sem nenhum pedido/cliente (retorno vazio/zerado sem erro), mais um cenário de regressão para `totalVendas` (pedido real não-cancelado deve refletir no KPI, sem depender de lançamento manual em `financeiro_movimentacao`).
- **Risco se ficar pendente:** regressão futura nas queries de `getDashboard` (ex.: alguém reintroduzir `SUM(total_com_imposto)` sem `COALESCE`, remover o `, 0` final, ou voltar a ler `totalVendas` de `financeiro_movimentacao`) só seria descoberta em um novo smoke test manual, não no CI.
- **Status:** ABERTO
- **Relacionado:** PROB-0055, PROB-0056, BUG-0013, BUG-0014, BUG-0015, BUG-0016, BACKLOG-0018

---

### BACKLOG-0018 — Confirmar decisão de negócio: fonte de verdade do KPI "Faturamento" do Dashboard (pedidos vs. lançamento financeiro manual)
- **Prioridade:** P1
- **Área:** backend / produto
- **Motivo:** BUG-0016 (PROB-0056) corrigiu o KPI "Faturamento" do Dashboard, que estava sempre `R$ 0`, trocando sua fonte de `financeiro_movimentacao` (lançamentos manuais tipo 'Venda', nunca criados automaticamente pelo sistema) para `pedidos` reais não-cancelados — mesma fonte já usada por "Evolução de Venda"/"Curva ABC de Clientes". Essa troca resolve a inconsistência visual (dois números de venda diferentes na mesma tela), mas embute uma decisão de negócio que não foi formalmente confirmada com o usuário/PO: que "Faturamento" deve refletir pedidos faturados, e não bookkeeping manual do módulo Financeiro. Se a intenção de negócio for a oposta (KPI deveria refletir lançamentos manuais, e faltaria criar automaticamente um lançamento tipo 'Venda' ao fechar pedido), a correção aplicada estaria resolvendo o sintoma errado.
- **Dependências:** nenhuma.
- **Critério de aceite:** usuário/PO confirma por escrito qual é a fonte de verdade correta para "Faturamento". Se confirmado "pedidos" (fonte já aplicada nesta sessão): documentar a decisão em `SYSTEM_OVERVIEW.md`. Se confirmado "lançamento manual": reverter BUG-0016 e/ou implementar criação automática de lançamento `financeiro_movimentacao` tipo 'Venda' ao fechar um pedido (mudança de código adicional, fora do escopo deste agente).
- **Risco se ficar pendente:** o fix de BUG-0016 pode ser revertido por desconhecimento em uma revisão futura, ou o "Saldo" do Dashboard (`saldo = faturamento - custos - comissoes`) voltar a ficar sistematicamente incorreto.
- **Status:** ABERTO
- **Relacionado:** PROB-0056, BUG-0016, BACKLOG-0017

---

### BACKLOG-0019 — Smoke visual pendente do fix de dropdowns (BUG-0017) e teto de 100 do backend como decisão consciente
- **Prioridade:** P2
- **Área:** frontend
- **Motivo:** o fix de BUG-0017 (novo `fetchAllPages` que pagina dropdowns em lotes de 100 até `meta.totalPages`) foi validado apenas por `npm run lint` + `npm run build` verdes; o **smoke visual em Safari com a stack no ar ficou PENDENTE**. Falta confirmar em runtime que: (1) um dropdown alimentado por uma lista real com mais de 100 registros (fornecedores, transportadoras, produtos, usuários/Responsável, vendedores) passa a exibir a lista inteira, sem truncar; (2) o dropdown "Vendedor" do `PedidoForm`, que antes herdava o default de 20 do backend por não enviar `limit`, agora traz todos os vendedores; (3) as `<option value=''>` que passaram a iniciar vazias (PedidoForm Fornecedor/Vendedor, ClienteForm UF, Financeiro Fornecedor, PrivacidadePage Cliente) renderizam como esperado. Item separado registrado no mesmo backlog: o **teto de 100 itens por página do backend permanece intencional** (guard anti-abuso deliberado) — `fetchAllPages` foi desenhado justamente para conviver com esse teto, e não deve ser removido; qualquer proposta futura de aumentar/remover o teto deve passar por revisão de segurança, não ser tratada como bug.
- **Dependências:** stack (frontend + backend + Postgres) no ar; dataset de teste com mais de 100 registros em pelo menos uma das entidades dos dropdowns afetados.
- **Critério de aceite:** smoke visual manual registrado (evidência/screenshot) confirmando lista completa nos 6 call sites de `fetchAllPages` e as options vazias nas 5 telas de UX; decisão de manter o teto de 100 do backend documentada como consciente (esta entrada serve de registro), sem alteração de código no guard.
- **Risco se ficar pendente:** o fix pode conter uma regressão de runtime não detectada por `lint`/`build` (ex.: formato de resposta paginada não coberto por `normalizeListResponse` numa das rotas, ou option vazia confundindo o usuário); e o teto de 100 pode ser removido/afrouxado por engano numa revisão futura, reabrindo o vetor anti-abuso que ele protege.
- **Status:** ABERTO
- **Relacionado:** BUG-0017

# MetaRenowa P0 (21/07/2026)

- Implementado: contrato server-side de cálculo, migration dos campos, criação/edição transacional, integração de cadastros e PDF de validação.
- Validado: smoke real autenticado com PostgreSQL, criação/edição/reabertura e PDFs de 1, 10 e 70 itens.
- Infraestrutura pendente: sanear o baseline de `schema_migrations` no banco dev legado; o runner completo encontra tabelas preexistentes ao tentar aplicar `001_initial_schema.sql`.
- P1 preservado: Sintegra, aceite/assinatura digital, envio externo e regras financeiras avançadas. Detalhes em `docs/MetaRenowa.md`.
