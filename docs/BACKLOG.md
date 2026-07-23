# BACKLOG — Renowa

> Contém apenas itens **não fechados**. Registros fechados foram removidos na limpeza pré-produção (2026-07-23); o histórico permanece no git.

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

### BACKLOG-0020 — `RolesPage.tsx` não tem UI para renomear um perfil de acesso existente
- **Prioridade:** P3
- **Área:** frontend
- **Motivo:** o backend suporta renomear uma role (`PATCH /roles/:id` → `RolesService.updateRole`, aceita `dto.name`, com a proteção `is_system` já aplicada — recusa rename de role de sistema com `ForbiddenException`, confirmado por leitura de `backend/src/roles/roles.service.ts:179-196`), mas `frontend/src/pages/configuracoes/RolesPage.tsx` só tem dois diálogos: "Novo perfil de acesso" (criação) e "Permissões de `<nome>`" (edição só de permissões) — confirmado por leitura do arquivo (`grep -n "Dialog\b" RolesPage.tsx`, sem nenhum diálogo/formulário de rename para role existente). Item pré-existente, **não introduzido** pelo overhaul de RBAC de 2026-07-22 (PROB-0058) — a Etapa 5 daquele overhaul adicionou o checklist de permissões na criação e o badge/bloqueio de `is_system`, mas não tocou em rename.
- **Dependências:** nenhuma.
- **Critério de aceite:** tela de Perfis de acesso ganha um formulário/botão para editar o `name`/`description` de uma role existente, chamando o `PATCH /roles/:id` já existente; botão de rename desabilitado (mesmo padrão das outras ações) quando `isSystem === true`, coerente com o 403 que o backend já retorna nesse caso.
- **Risco se ficar pendente:** usuário admin não consegue corrigir o nome de um perfil de acesso criado com erro de digitação sem recriar a role do zero (perdendo o histórico e tendo que reatribuir permissões e usuários).
- **Status:** ABERTO
- **Relacionado:** PROB-0058

### BACKLOG-0021 — Trocar o fornecedor no cabeçalho de um pedido apaga silenciosamente todos os itens já lançados
- **Prioridade:** P1
- **Área:** frontend
- **Motivo:** encontrado na crítica de design pós-implementação do "Fluxo Comercial Completo" (P2, adiada por decisão do usuário — só os 3 P1 de consistência visual do Financeiro foram corrigidos nesta rodada). Confirmado por leitura de código: `frontend/src/pages/PedidoForm.tsx:247` executa `setItems([newItem()])` no `onChange` do `<select>` de fornecedor, sem nenhuma confirmação nem aviso ao usuário — qualquer troca de fornecedor no cabeçalho, mesmo acidental, descarta todos os itens (produto/quantidade/preço/desconto) já preenchidos na tela, sem possibilidade de desfazer.
- **Dependências:** nenhuma.
- **Critério de aceite:** trocar o fornecedor com itens já lançados exige confirmação explícita do usuário (ex.: modal "Trocar o fornecedor vai limpar os N itens já lançados. Continuar?") antes de executar `setItems([newItem()])`; se o usuário cancelar, o fornecedor anterior permanece selecionado e os itens são preservados.
- **Risco se ficar pendente:** perda de dado em campo sem aviso — persona "representante não-técnico sob pressão" (ver `PRODUCT.md`) tem alta chance de perder um pedido inteiro já digitado por trocar o fornecedor sem querer ou para corrigir um erro de digitação no nome, não esperando que isso apague os itens.
- **Status:** ABERTO
- **Relacionado:** PROB-0059, PROB-0060 (achados da mesma implementação, sem relação direta de causa)

### BACKLOG-0022 — "Liberar pedido" é irreversível mas não pede confirmação; ícone `Unlock` comunica o oposto do efeito real
- **Prioridade:** P1
- **Área:** frontend
- **Motivo:** encontrado na crítica de design pós-implementação do "Fluxo Comercial Completo" (P1, adiada por decisão do usuário — escolhido corrigir nesta rodada só os 3 P1 de consistência visual do Financeiro). Confirmado por leitura de código: o botão "Liberar pedido" existe em `frontend/src/pages/PedidoForm.tsx:213-216` e `frontend/src/pages/PedidoDetalhe.tsx:128-131`, ambos chamando `handleLiberar()` direto no `onClick`, sem nenhum `window.confirm`/modal antes de disparar `liberarOrder`. A ação é irreversível — liberar um pedido trava permanentemente a edição comercial/itens (`isPedidoLocked`, `frontend/src/lib/orderPermissions.ts`). Os dois botões usam o ícone `Unlock` (lucide-react) — que visualmente comunica "destravar", o oposto semântico do efeito real (a ação trava o pedido, não destrava).
- **Dependências:** nenhuma.
- **Critério de aceite:** clique em "Liberar pedido" exige confirmação explícita (modal do design system, não `window.confirm` — ver BACKLOG-0023) informando que a ação é irreversível e trava a edição; ícone trocado por um que comunique "travar/lacrar" (ex.: `Lock` ou `CheckCircle`) em vez de `Unlock`, nos dois arquivos.
- **Risco se ficar pendente:** usuário libera um pedido por engano (clique acidental, ou por interpretar o ícone `Unlock` como "destravar para editar") e perde a capacidade de corrigir itens/dados comerciais sem nenhum aviso prévio — atrito operacional e risco de pedido incorreto seguir para faturamento.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0023

### BACKLOG-0023 — Ações destrutivas usam `window.confirm()`/`confirm()` nativo do navegador em vez do `Dialog` acessível do design system
- **Prioridade:** P2
- **Área:** frontend
- **Motivo:** encontrado na crítica de design pós-implementação do "Fluxo Comercial Completo" (mesmo P1 de BACKLOG-0022, adiado pela mesma decisão do usuário). Confirmado por grep no código atual — 7 pontos usam o `confirm()`/`window.confirm()` nativo do navegador em vez do componente `Dialog` do design system já usado em outras partes do app: `frontend/src/pages/Fornecedores.tsx:29` (remover fornecedor), `frontend/src/pages/PedidoDetalhe.tsx:59` (cancelar pedido), `frontend/src/pages/FaturamentoDetalhe.tsx:97` (excluir nota fiscal, módulo novo desta implementação), `frontend/src/pages/Transporte.tsx:107` (excluir transportadora), `frontend/src/pages/configuracoes/RolesPage.tsx:161` (desativar perfil de acesso), `frontend/src/pages/Financeiro.tsx:886` (remover custo) e `frontend/src/pages/Financeiro.tsx:1041` (remover registro/inadimplência). `window.confirm`/`confirm()` nativo é inconsistente visualmente com o resto do app e tem suporte pior a leitor de tela do que um `Dialog` acessível controlado pela aplicação.
- **Dependências:** nenhuma.
- **Critério de aceite:** os 7 call sites listados passam a usar um componente `Dialog`/`AlertDialog` do design system (com foco gerenciado e texto lido corretamente por leitor de tela) em vez de `window.confirm()`/`confirm()` nativo, mantendo o mesmo texto de confirmação já existente em cada um.
- **Risco se ficar pendente:** inconsistência visual entre módulos do app e pior suporte a acessibilidade (leitor de tela) nas 7 ações destrutivas listadas; nenhum risco de integridade de dado (a confirmação em si já existe, só o componente usado para ela é inconsistente).
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0022

### BACKLOG-0024 — `GET /consultas/cnpj/:cnpj` sem throttle próprio nem cache: consome a cota de IP da aplicação contra a BrasilAPI
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** o endpoint é um proxy autenticado para a BrasilAPI e não tem `@Throttle` próprio nem cache. Todo tenant compartilha o mesmo IP de saída da aplicação: um único usuário em loop gasta a cota e um bloqueio do IP **derruba a função de consulta de CNPJ para todos os tenants**. **Veredito registrado do `security-auditor`, para não ser reauditado a cada rodada: a ausência de `@RequirePermission` neste endpoint é aceitável** — ele exige autenticação, não toca dado de tenant, o CNPJ é normalizado e validado por dígito verificador antes de compor a URL (portanto **sem SSRF**), tem timeout de 5s, o erro da API externa não vaza para o cliente e a resposta passa por allowlist de 9 campos.
- **Dependências:** nenhuma.
- **Critério de aceite:** rota com `@Throttle` dedicado (limite por usuário/tenant, não só global) e cache de resposta por CNPJ com TTL definido; teste cobrindo que a segunda consulta ao mesmo CNPJ dentro do TTL não chama a API externa.
- **Risco se ficar pendente:** indisponibilidade da consulta de CNPJ para todos os tenants por bloqueio de IP causado por um único usuário.
- **Status:** ABERTO

### BACKLOG-0025 — Comissão gerada pelo faturamento nasce sem `numero_nfe`/`data_faturamento` e some da tela por filtro de data errado
- **Prioridade:** P1
- **Área:** backend / frontend
- **Motivo:** dois defeitos que se somam. (1) `faturamento.service.ts:182-196` cria a comissão sem `numero_nfe` e sem `data_faturamento` — a coluna "NF-e" da tela de Financeiro mostra sempre "—". (2) `findAllComissoes` e `getResumoComissoes` filtram por `data_pedido` (`finance.service.ts:304-309`, `:336-341`) enquanto a tela abre no mês corrente: faturar hoje um pedido antigo faz a comissão **não aparecer**; e com a data nula, ela não aparece em mês nenhum.
- **Dependências:** decisão de negócio sobre qual data governa a listagem de comissões (data do pedido vs. data do faturamento).
- **Critério de aceite:** comissão criada pelo faturamento nasce com `numero_nfe` e `data_faturamento` preenchidos; a listagem/resumo de comissões usa a data acordada e exibe a comissão de um pedido antigo faturado hoje; teste cobre o caso "pedido de mês anterior faturado no mês corrente".
- **Risco se ficar pendente:** comissão real invisível na tela — usuário conclui que o faturamento não gerou comissão.
- **Status:** ABERTO
- **Relacionado:** PROB-0066

### BACKLOG-0026 — Pedido totalmente faturado vira beco sem saída na UI
- **Prioridade:** P2
- **Área:** frontend
- **Motivo:** ao ficar `faturado`, o pedido some de `GET /faturamento/pedidos` e **não existe nenhum link para `/faturamento/:uuid` fora daquela lista**. O backend permite corrigir a nota; a UI não oferece caminho.
- **Dependências:** nenhuma.
- **Critério de aceite:** a tela de detalhe do pedido (e/ou a listagem de pedidos) oferece navegação para as notas fiscais do pedido mesmo quando ele está `faturado`.
- **Risco se ficar pendente:** correção de nota fiscal só por acesso direto à URL ou ao banco.
- **Status:** ABERTO

### BACKLOG-0027 — `cross-tenant-foreign-keys.spec.ts` sem nenhuma asserção para `NotaFiscal`/`Commission`
- **Prioridade:** P1
- **Área:** backend / segurança
- **Motivo:** `backend/src/database/cross-tenant-foreign-keys.spec.ts:30-47` — `NotaFiscal` foi adicionado só para o `buildMetadatas()` não quebrar; **nenhuma asserção** cobre `NotaFiscal.pedido`, `Commission.pedido` nem `Commission.notaFiscal`. As entidades **estão corretas** (FKs compostas com `tenant_id`), mas o módulo novo ficou sem guarda de regressão — exatamente o teste que existe para impedir que uma FK perca o par de tenant.
- **Dependências:** nenhuma.
- **Critério de aceite:** o spec passa a assertar as 3 relações; remover `tenant_id` de qualquer uma delas faz o teste falhar.
- **Risco se ficar pendente:** regressão silenciosa de isolamento multi-tenant no módulo mais novo do sistema.
- **Status:** ABERTO

### BACKLOG-0028 — Teste de integração real contra Postgres para concorrência no `FaturamentoService`
- **Prioridade:** P1
- **Área:** backend
- **Motivo:** **toda a suíte de `faturamento`/`finance`/`orders` é mock puro** (`jest.fn()` sobre repositórios); nada roda contra Postgres. Os 236 testes verdes **não provam** que locks pessimistas, FKs compostas, índices únicos parciais e CHECKs funcionem. A asserção central "duas notas concorrentes no mesmo pedido serializam" é **inverificável** hoje, e a promessa "sem comissão duplicada" repousa inteiramente no índice `uq_comissoes_tenant_nota_fiscal_active`, que **nunca foi exercitado** por teste.
- **Dependências:** infraestrutura de teste com Postgres real (container efêmero) — hoje inexistente no projeto.
- **Critério de aceite:** existe ao menos um teste de integração que sobe Postgres real, aplica as migrations e prova (a) que duas emissões concorrentes de nota no mesmo pedido serializam e (b) que a segunda comissão para a mesma nota é rejeitada pelo índice único.
- **Risco se ficar pendente:** as garantias centrais do ciclo comercial são afirmações não testadas — e o PROB-0059 já mostrou que essas invariantes podem simplesmente desaparecer do banco sem ninguém notar.
- **Status:** ABERTO
- **Relacionado:** PROB-0059, BUG-0022, BUG-0023

### BACKLOG-0029 — `perc_comissao` sem `@Min(0)`/`@Max(100)`
- **Prioridade:** P1
- **Área:** backend
- **Motivo:** `backend/src/finance/dto/commission-action.dto.ts:5-6` aceita percentual negativo (**comissão negativa entra no fluxo de caixa**) e valor como `"9999"`, que estoura `numeric(5,2)` e vira **500** em vez de 400.
- **Dependências:** nenhuma.
- **Critério de aceite:** `@Min(0) @Max(100)` no DTO; teste cobrindo `-1` e `9999` retornando 400.
- **Risco se ficar pendente:** dado financeiro inválido persistido e erro 500 em input de usuário.
- **Status:** ABERTO

### BACKLOG-0030 — `@MaxLength` ausente em todos os DTOs novos
- **Prioridade:** P2
- **Área:** backend / segurança
- **Motivo:** falta `@MaxLength` em `backend/src/faturamento/dto/`, `backend/src/suppliers/dto/` e `backend/src/clients/dto/create-client.dto.ts`; `observacao` de nota fiscal é `text` **sem teto**. Sem limite, qualquer campo textual aceita payload arbitrariamente grande.
- **Dependências:** nenhuma.
- **Critério de aceite:** todo campo string dos DTOs citados tem `@MaxLength` compatível com o tipo da coluna; `observacao` tem teto explícito.
- **Risco se ficar pendente:** payloads grandes inflando o banco e degradando listagens; erro de banco vazando como 500 em campos com limite físico.
- **Status:** ABERTO

### BACKLOG-0031 — `valor_faturado` é `numeric(12,2)` mas copia `notas_fiscais.valor`, que é `numeric(18,2)`
- **Prioridade:** P2
- **Área:** banco / backend
- **Motivo:** `backend/src/finance/entities/commission.entity.ts:85-86` declara `valor_faturado` como `numeric(12,2)` enquanto a origem do valor é `notas_fiscais.valor`, `numeric(18,2)`. Acima de 10^10 há **overflow** na cópia.
- **Dependências:** migration de alteração de tipo.
- **Critério de aceite:** os dois campos têm a mesma precisão; migration aplicada e verificada por `db:verify`.
- **Risco se ficar pendente:** erro em runtime (500) ao faturar nota de valor muito alto; limite hoje não documentado em lugar nenhum.
- **Status:** ABERTO

### BACKLOG-0032 — `excluirNota` usa `softRemove` em vez do helper `optimisticSoftDelete`
- **Prioridade:** P3
- **Área:** backend
- **Motivo:** `backend/src/faturamento/faturamento.service.ts:296-297` usa `softRemove`. É **seguro sob o lock pessimista** já aplicado, mas foge do helper padrão do projeto e **não incrementa `version`** — inconsistente com o controle de concorrência otimista do resto do sistema.
- **Dependências:** nenhuma.
- **Critério de aceite:** o caminho passa a usar `optimisticSoftDelete` (ou fica documentado no código o motivo explícito de não usar).
- **Risco se ficar pendente:** baixo hoje; vira problema se o lock for removido/refatorado no futuro sem ninguém notar a dependência.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0014, PROB-0063

### BACKLOG-0033 — Import de produtos faz N+1 dentro de uma transação longa
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** `backend/src/products/products.service.ts:216-218` — até 10 mil queries seriais dentro de uma única transação, **segurando locks** o tempo todo.
- **Dependências:** coordenar com a frente em andamento de substituição do parser (PROB-0069), que toca o mesmo fluxo.
- **Critério de aceite:** importação em lote (`IN`/`upsert` em blocos) sem consulta por linha; transação não excede um tempo alvo definido para 10k linhas.
- **Risco se ficar pendente:** importação grande trava escrita concorrente na tabela de produtos.
- **Status:** ABERTO
- **Relacionado:** PROB-0069, PROB-0070

### BACKLOG-0034 — Bundle de `PedidoDetalhe` com 1,48 MB (496 kB gzip)
- **Prioridade:** P2
- **Área:** frontend
- **Motivo:** `dist/assets/PedidoDetalhe-*.js` com 1,48 MB. Provável (não confirmado) que `xlsx` e/ou a lib de PDF estejam entrando estaticamente na rota em vez de por `import()` dinâmico.
- **Dependências:** a frente de PROB-0069 pode remover `xlsx` do backend, mas o frontend precisa ser verificado à parte.
- **Critério de aceite:** confirmar a origem do peso por análise do bundle e mover as libs pesadas para dynamic import; chunk da rota abaixo de um teto acordado.
- **Risco se ficar pendente:** carregamento lento da tela mais usada do fluxo comercial, especialmente em conexão móvel.
- **Status:** ABERTO

### BACKLOG-0035 — `0007_optimistic_concurrency.sql` tem `BEGIN;`/`COMMIT;` próprios dentro da transação do runner
- **Prioridade:** P1
- **Área:** banco / infra
- **Motivo:** o `COMMIT` interno **encerra a transação externa do runner antes do registro em `schema_migrations`**, quebrando a atomicidade num provisionamento do zero. Latente hoje (o banco de dev já tinha a migration aplicada), mas é **candidato à causa raiz de PROB-0061 e PROB-0060** — os dois têm a mesma assinatura: migration registrada, objetos ausentes.
- **Dependências:** nenhuma para a correção do arquivo; a investigação do baseline depende de BACKLOG-0039.
- **Critério de aceite:** nenhuma migration contém `BEGIN`/`COMMIT` próprios; provisionamento de banco vazio do zero resulta em `db:verify` limpo; `grep` confirma que não há outro arquivo com o mesmo padrão.
- **Risco se ficar pendente:** migrations continuam podendo ser marcadas como aplicadas sem ter aplicado nada — o problema que tornou `schema_migrations` não confiável.
- **Status:** ABERTO
- **Relacionado:** PROB-0060, PROB-0061, BACKLOG-0039

### BACKLOG-0036 — Paridade dev/prod de versão do PostgreSQL (15.18 em dev, `postgres:16-alpine` em prod)
- **Prioridade:** P2
- **Área:** infra
- **Motivo:** dev roda PostgreSQL 15.18 e `docker-compose.prod.yml` fixa `postgres:16-alpine`. Toda a verificação de schema desta sessão foi feita contra a 15.
- **Dependências:** nenhuma.
- **Critério de aceite:** dev e prod na mesma major, ou divergência documentada com a lista do que muda entre elas para os recursos usados pelo projeto.
- **Risco se ficar pendente:** comportamento validado em dev não necessariamente vale em produção — risco maior agora que dev deixou de usar `synchronize` e depende do mesmo caminho de migrations.
- **Status:** ABERTO
- **Relacionado:** PROB-0059

### BACKLOG-0037 — `POST /produtos` passou a exigir fornecedor, mas `fornecedor_uuid` continua opcional no DTO
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** `backend/src/products/products.service.ts:47-49` passou a exigir fornecedor. É regra de negócio defensável, mas é **breaking change de contrato** — e como `fornecedor_uuid` segue opcional no DTO, o erro só aparece em **runtime**, não na validação.
- **Dependências:** confirmar com o usuário que a obrigatoriedade é intencional.
- **Critério de aceite:** se intencional, o DTO reflete a regra (campo obrigatório, erro 400 na validação) e a mudança é registrada como breaking change; se não, a regra é revertida.
- **Risco se ficar pendente:** integrações e o app mobile quebram sem mensagem clara de validação.
- **Status:** ABERTO
- **Relacionado:** PROB-0064

### BACKLOG-0038 — Divergência doc × código: `valor_comissao` é descrito como imutável, mas é recalculado
- **Prioridade:** P2
- **Área:** backend / documentação
- **Motivo:** `backend/src/finance/entities/commission.entity.ts:9-11` afirma que `valor_comissao` é "snapshot imutável… NUNCA recalculado retroativamente", mas `backend/src/faturamento/faturamento.service.ts:256-258` **recalcula** quando a nota muda de valor. **Um dos dois está errado** e é preciso decidir qual antes que alguém confie no comentário.
- **Dependências:** decisão de negócio sobre o comportamento correto.
- **Critério de aceite:** comportamento decidido, código e comentário alinhados, teste cobrindo o caso "nota alterada depois da comissão criada".
- **Risco se ficar pendente:** decisão financeira tomada com base em um comentário que contradiz o código em produção.
- **Status:** ABERTO
- **Relacionado:** PROB-0066

### BACKLOG-0039 — Onboarding de banco vazio vira caminho crítico agora que `synchronize` está desligado em dev
- **Prioridade:** P1
- **Área:** infra / banco
- **Motivo:** com `synchronize` desligado em dev (BUG-0019), provisionar um ambiente novo passa a depender inteiramente do migration runner. A nota já existente neste backlog sobre o runner **tropeçar em `001_initial_schema.sql` quando encontra tabelas preexistentes** deixa de ser incômodo e vira bloqueio de onboarding. Some-se o baseline sujo de `schema_migrations` (PROB-0061) e o `BEGIN`/`COMMIT` da `0007` (BACKLOG-0035).
- **Dependências:** BACKLOG-0035.
- **Critério de aceite:** `npm run db:migrate` sobe um banco **vazio** do zero até o schema atual sem erro, e `npm run db:verify` termina limpo em seguida; o procedimento está documentado para onboarding.
- **Risco se ficar pendente:** desenvolvedor novo não consegue subir o ambiente, e não há caminho confiável para recriar o schema em um ambiente limpo — inclusive em recuperação de desastre.
- **Status:** ABERTO
- **Relacionado:** PROB-0059, PROB-0061, BACKLOG-0035, BUG-0019

### BACKLOG-0040 — Migração NestJS 10 → 11 (item com data própria; não pode ficar para depois do deploy)
- **Prioridade:** P1
- **Área:** infra / segurança
- **Motivo:** o projeto está em NestJS 10.4.22, a **última 10.x que vai existir**. `npm audit --omit=dev` retorna 20 achados, 10 high, e o advisory do próprio `@nestjs/core` tem range `<=11.1.17` — só corrigido em 11.1.18+, isto é, **NestJS 10 nunca vai receber**. Mesma situação para `body-parser` e `qs`. Ver PROB-0068 para a triagem completa, inclusive a lista de **não-aplicáveis com motivo**.
- **Dependências:** suíte completa verde como rede de segurança (existe, mas é mock puro — ver BACKLOG-0028).
- **Critério de aceite:** backend em NestJS 11.1.28+ (ou superior corrigido), suíte completa verde nos três workspaces, `npm audit --omit=dev` sem HIGH atribuível à linha do NestJS, **com data acordada explicitamente com o usuário**.
- **Risco se ficar pendente:** ir para produção com 10 advisories HIGH numa linha de dependência sem manutenção e sem caminho de correção.
- **Status:** ABERTO
- **Relacionado:** PROB-0068, PROB-0069, PROB-0071

### BACKLOG-0041 — GATE DE DEPLOY: rodar `db:verify` contra produção antes de subir
- **Prioridade:** P0
- **Área:** banco / infra
- **Motivo:** **nenhuma verificação contra o banco de produção foi feita nesta sessão.** Três problemas distintos deixam o estado de produção desconhecido: PROB-0059 (invariantes apagadas — em dev estavam **zeradas**, 0 de ~20 CHECKs), PROB-0060 (triggers `set_updated_at` ausentes) e PROB-0061 (infra de sync de `0008`/`0009` inexistente apesar de registrada como aplicada). E a lição transversal do PROB-0061 é que **`schema_migrations` não é evidência confiável do que existe no banco, em nenhum ambiente** — só a inspeção do catálogo do Postgres é. A ferramenta para isso passou a existir nesta sessão (`npm run db:verify`, read-only, parametrizado por `DATABASE_URL`).
- **Dependências:** acesso ao `DATABASE_URL` de produção; BUG-0021 (a ferramenta) já está pronto no working tree, **sem commit**.
- **Critério de aceite:** `db:verify` executado contra produção com saída registrada; para cada divergência encontrada, decisão explícita (aplicar `0031`, que é idempotente e aditiva, ou tratar como incidente). Só então o deploy segue.
- **Risco se ficar pendente:** subir para produção sem saber se o banco tem CHECKs de `version > 0` (base do controle de concorrência otimista), índices únicos que impedem comissão duplicada, triggers de `updated_at` e as tabelas de sync. Se qualquer um faltar, a falha aparece como corrupção silenciosa de dado real, não como erro.
- **Status:** ABERTO
- **Relacionado:** PROB-0059, PROB-0060, PROB-0061, BUG-0020, BUG-0021

### BACKLOG-0042 — Comunicar a usuários a mudança de contrato da importação de produtos: `.xlsx` deixou de ser aceito
- **Prioridade:** P1
- **Área:** produto / documentação / frontend
- **Motivo:** ao fechar PROB-0069 (BUG-0024), `POST /produtos/importacao` passou a aceitar **só `.csv`**; `.xlsx` agora recebe **400** com `'Tipo de arquivo inválido. Utilize .csv (UTF-8).'`. **Quem já importava planilha `.xlsx` perde o fluxo sem aviso prévio.** A UI foi atualizada no mesmo trabalho (`frontend/src/pages/Produtos.tsx`: `accept='.csv,text/csv'`, label `Arquivo (.csv)`, instrução "Arquivo > Salvar como > CSV UTF-8 (delimitado por vírgulas)", as 3 colunas esperadas `codigo`/`descricao`/`preco_base`, limite de 5.000 linhas) — **mas texto na tela não é comunicação de mudança de contrato.** O shape do `ImportProductsResultDto` não mudou e o **mobile não consome essa rota**, então o impacto é exclusivamente no usuário web que importa planilha.
- **Dependências:** BUG-0024 commitado e implantado.
- **Critério de aceite:** aviso enviado a quem usa a importação (canal a definir pelo usuário), com o passo a passo de "Salvar como > CSV UTF-8" no Excel; se houver material de apoio/treinamento do produto, atualizado no mesmo movimento.
- **Risco se ficar pendente:** usuário tenta importar a planilha de sempre, toma 400 e conclui que o sistema quebrou — suporte evitável, e desconfiança logo depois de um deploy.
- **Status:** ABERTO
- **Relacionado:** PROB-0069, BUG-0024

### BACKLOG-0043 — Guarda permanente para o override de `multer` sob `platform-express@10` (o teste que provou isso foi removido)
- **Prioridade:** P2
- **Área:** infra / qualidade / backend
- **Motivo:** ao fechar PROB-0071, ficou claro que **build verde não prova que `multer@2.2.0` funciona sob `@nestjs/platform-express@10.4.22`** — o override força uma versão que o pacote não declara. A prova foi feita com um teste **temporário** (Nest + supertest subindo um `FileInterceptor` real: upload multipart chegou com buffer íntegro, arquivo de 6 MB recebeu 413) e **o arquivo foi removido depois — não está no diff.** Hoje não existe nada no repositório que falhe se o override quebrar o upload.
- **Dependências:** nenhuma; o padrão do teste já foi validado uma vez nesta sessão.
- **Critério de aceite:** teste de integração versionado que suba um módulo Nest mínimo com `FileInterceptor`, faça upload multipart real e assere (a) buffer íntegro no handler e (b) **413** acima do limite configurado. Roda na suíte normal do backend.
- **Risco se ficar pendente:** um `npm install`/bump futuro reverte ou altera a resolução do `multer` e a importação de produtos quebra **em produção**, sem nenhum teste vermelho antes.
- **Status:** ABERTO
- **Relacionado:** PROB-0071, BUG-0026, BACKLOG-0040

### BACKLOG-0044 — Item de checklist: conferir cópia única de `typeorm` após qualquer `npm install`
- **Prioridade:** P2
- **Área:** infra / banco
- **Motivo:** o bump para `typeorm@0.3.31` **criou duas cópias em disco** (`node_modules/typeorm@0.3.28`, puxada pelo peer do `@nestjs/typeorm`, + `backend/node_modules/typeorm@0.3.31`). **Duas instâncias de TypeORM no mesmo processo duplicam o metadata storage e quebrariam em produção** — e nada no build ou na suíte acusa isso. `npm update typeorm` deduplicou (estado atual verificado: uma única cópia, `backend/node_modules/typeorm` não existe mais), mas a duplicação **pode voltar em qualquer `npm install`**.
- **Dependências:** nenhuma.
- **Critério de aceite:** verificação de cópia única (`npm ls typeorm` ou script equivalente) incorporada ao checklist de manutenção de dependências e/ou ao CI, falhando quando houver mais de uma versão resolvida.
- **Risco se ficar pendente:** falha em produção difícil de diagnosticar (metadata duplicada), disparada por um `npm install` de rotina que ninguém associa à causa.
- **Status:** ABERTO
- **Relacionado:** PROB-0071, BUG-0026

### BACKLOG-0045 — Validar a importação com arquivo real exportado do Excel pt-BR antes do go-live
- **Prioridade:** P1
- **Área:** backend / qualidade
- **Motivo:** toda a cobertura de BUG-0024/BUG-0025 usa **bytes simulados** (BOM, Windows-1252, separador `;`) e `manager` mockado. Isso cobre a mecânica, mas **nenhum arquivo realmente exportado pelo Excel pt-BR foi usado**, e o caminho `dataSource.transaction` + upsert **nunca rodou contra Postgres** (ver BACKLOG-0028 para a ressalva estrutural da suíte). Um teste manual com export de verdade é barato e fecha as duas lacunas de uma vez.
- **Dependências:** ambiente com Postgres e um `.xlsx` real salvo como CSV pelo Excel em pt-BR.
- **Critério de aceite:** importação manual executada com arquivo exportado de verdade, conferindo (a) acentuação preservada, (b) separador detectado, (c) preços acima de mil (`1.234,56`) importados com o valor certo, (d) contagem do `ImportProductsResultDto` batendo com o arquivo. Resultado registrado.
- **Risco se ficar pendente:** ir para produção com a correção validada só contra fixtures que o próprio time escreveu — exatamente a classe de erro que produziu PROB-0070.
- **Status:** ABERTO
- **Relacionado:** PROB-0069, PROB-0070, BUG-0024, BUG-0025, BACKLOG-0028

### BACKLOG-0046 — `preview` do papaparse não limita memória: bound real da importação continua sendo o limite de 5 MB do multer
- **Prioridade:** P3
- **Área:** backend / segurança
- **Motivo:** o `preview: IMPORT_MAX_ROWS + 1` resolveu o loop O(n) e o array de linhas, mas **o buffer inteiro é decodificado para string antes do parse** (`decodeCsvBuffer`). Ou seja, o teto de memória do request continua sendo o limite de 5 MB do multer, não o `preview`. Isso é aceitável hoje (CSV não comprime como `.xlsx`, então o limite de 5 MB é um bound honesto — diferente do cenário de PROB-0069), mas é uma limitação **conhecida**, não uma proteção.
- **Dependências:** mudar a assinatura do fluxo de importação para `Readable` (streaming) — não feito de propósito nesta rodada.
- **Critério de aceite:** parse por stream, sem materializar o arquivo inteiro em string, mantendo BOM/encoding, auto-detecção de separador e o corte em `IMPORT_MAX_ROWS`; teste demonstrando memória estável com arquivo no teto do limite.
- **Risco se ficar pendente:** baixo hoje; sobe se o limite de 5 MB do multer for aumentado sem revisitar este ponto — **aí o bound desaparece junto.**
- **Status:** ABERTO
- **Relacionado:** PROB-0069, BUG-0024

# MetaRenowa P0 (21/07/2026)

- Implementado: contrato server-side de cálculo, migration dos campos, criação/edição transacional, integração de cadastros e PDF de validação.
- Validado: smoke real autenticado com PostgreSQL, criação/edição/reabertura e PDFs de 1, 10 e 70 itens.
- Infraestrutura pendente: sanear o baseline de `schema_migrations` no banco dev legado; o runner completo encontra tabelas preexistentes ao tentar aplicar `001_initial_schema.sql`.
- P1 preservado: Sintegra, aceite/assinatura digital, envio externo e regras financeiras avançadas. Detalhes em `docs/MetaRenowa.md`.
