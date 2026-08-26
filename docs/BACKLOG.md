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
- **Status:** FECHADO (verificado contra o código em 2026-07-31) — o endpoint existe: `PUT /pedidos/:uuid` (`backend/src/orders/orders.controller.ts:69`, permissão `pedidos.editar`) e `OrdersService.update` processa `dto.itens` com checagem de tenant por item (`orders.service.ts:306-311`); concorrência otimista via `VersionDto`; `PedidoForm.tsx` edita itens em modo edição. Testes cobrindo ownership de vendedor e bloqueio de edição pós-liberação em `orders.service.spec.ts:231`. O registro seguia ABERTO por desatualização, não por escopo pendente.
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
- **Status:** FECHADO (verificado contra o código em 2026-07-31) — resolvido no escopo de BACKLOG-0066, por caminho diferente do critério de aceite acima: em vez de pedir confirmação antes de descartar, `handleSupplierChange` (`frontend/src/pages/PedidoForm.tsx:165-172`) **não descarta mais**. A linha sobrevive, só o que veio do produto do fornecedor antigo é desvinculado (`produto_uuid`, `codigo_manual`, `descricao_manual`, `preco_unitario`) e a linha é marcada com `precisa_produto`; quantidades e percentuais digitados ficam, e a linha manual fica intacta. Sem descarte, não há o que confirmar.
- **Relacionado:** PROB-0059, PROB-0060 (achados da mesma implementação, sem relação direta de causa), BACKLOG-0066

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
- **Motivo:** dois defeitos que se somam. (1) `faturamento.service.ts:182-196` cria a comissão sem `numero_nfe` e sem `data_faturamento` — a coluna "NF-e" da tela de Financeiro mostra sempre "—". (2) `findAllComissoes` e `getResumoComissoes` filtram por `data_pedido` (`finance.service.ts:304-309`, `:336-341`) enquanto a tela abre no mês corrente: faturar hoje um pedido antigo faz a comissão **não aparecer** no mês corrente. **Correção ao registro original (2026-07-31):** a segunda metade da frase — "com a data nula, ela não aparece em mês nenhum" — é **falsa**. `faturamento.service.ts:201` grava `data_pedido: order.data`, então a comissão aparece normalmente no mês do pedido. O defeito de listagem é só o descasamento de mês descrito acima; o que fica nulo é `numero_nfe`/`data_faturamento`, o defeito (1).
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

### BACKLOG-0027 — `cross-tenant-foreign-keys.spec.ts` sem asserção para as relações de `NotaFiscal`
- **Prioridade:** P1
- **Área:** backend / segurança
- **Motivo:** `backend/src/database/cross-tenant-foreign-keys.spec.ts:30-47` — `NotaFiscal` foi adicionado só para o `buildMetadatas()` não quebrar; **nenhuma asserção** cobria `NotaFiscal.pedido`, `Commission.pedido` nem `Commission.notaFiscal`. As entidades **estão corretas** (FKs compostas com `tenant_id`), mas o módulo novo ficou sem guarda de regressão — exatamente o teste que existe para impedir que uma FK perca o par de tenant.
- **Escopo restante (verificado contra o código em 2026-07-31):** `Commission` **já está coberto** — o array `tenantRelations` tem `[Commission, 'cliente']` e `[Commission, 'fornecedor']` (linhas 37-38). `NotaFiscal` segue aparecendo só na lista de entities do `DataSource` (linha 69), sem nenhuma entrada em `tenantRelations`, apesar de a FK composta existir na entity (`nota-fiscal.entity.ts:21-22`). Falta acrescentar a relação `NotaFiscal → pedido` (e, se aplicável, `Commission → pedido` / `Commission → notaFiscal`, que também não estão no array).
- **Dependências:** nenhuma.
- **Critério de aceite:** o spec passa a assertar as relações faltantes; remover `tenant_id` de qualquer uma delas faz o teste falhar.
- **Risco se ficar pendente:** regressão silenciosa de isolamento multi-tenant no módulo mais novo do sistema.
- **Status:** ABERTO — escopo menor do que o título original sugeria

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
- **Status:** PARCIALMENTE_RESOLVIDO (verificado contra o código em 2026-07-31) — **a correção do arquivo está feita**: `0007_optimistic_concurrency.sql:1-2` abre com comentário explicando que o runner é quem envolve cada migration em transação, e `rg '^\s*(BEGIN|COMMIT)\s*;' backend/src/database/migrations/` não retorna nada em **nenhum** arquivo, cumprindo os dois primeiros critérios de aceite. Resta só o terceiro — provisionamento de banco vazio do zero com `db:verify` limpo — que já é o escopo de BACKLOG-0039. Não há trabalho próprio deste item além disso.
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
- **Superfície levantada por leitura (2026-07-31), para a janela não começar do zero:**
  - **Bumps obrigatórios** (`backend/package.json`): `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing`, `@nestjs/cli`, `@nestjs/schematics` → `^11.x`; `@nestjs/config` `^3.3.0` → `^4.x` (a v3 tem peer-dep em Nest 10); `@nestjs/typeorm` `^10.0.2` → `^11.x`. Já compatíveis, sem ação: `@nestjs/throttler` 6.5.0, `@nestjs/mapped-types` 2.x, `rxjs` 7.8.2, `typeorm` 0.3.31, `class-validator`, `reflect-metadata`.
  - **Remover o bloco `overrides` do `package.json` raiz** (`multer`, `express`, `body-parser`) — o próprio bloco tem o comentário mandando removê-lo nesta migração, e é ele que hoje segura o Express em 4.22.2. Com `platform-express@11` entram Express 5 e multer 2 nativamente; `multer` já está em 2.2.0 pelo override, então metade do risco já foi exercitada em produção.
  - **Declarar `engines: { node: ">=20" }`** — hoje nenhum `package.json` declara Node, e o Nest 11 exige ≥ 20. O CI já roda Node 22.
  - **Risco, em ordem:** (1) `common/guards/user-throttler.guard.ts` sobrescreve `getTracker(req)`, cuja assinatura passou a receber `(req, context)`, e lê `req.ip`, que muda sob Express 5 + `trust proxy`; companheiro: `common/throttling/redis-throttler.storage.ts` implementa `ThrottlerStorage` à mão. (2) `main.ts` alcança a instância Express crua para `set('trust proxy', …)`. (3) `cookie-parser` e `compression` precisam de major compatível com Express 5. (4) `@nestjs/config` v3→v4 é mecânico (só `get`/`getOrThrow` são usados) mas obrigatório. (5) quatro controllers com `FileInterceptor` + `@UploadedFile()`.
  - **Verificado como NÃO aplicável:** não há `CacheModule`, não há `nestjs-cls`, não há mutação de `req.query`, e não há rota wildcard (`'*'`/`@All()`) — o breaking change do `path-to-regexp` v8 não toca este código. `@types/express` já está em `^5.0.0`, então a migração tende a **reduzir** atrito de tipos.
  - **A suíte não certifica esta migração:** `@nestjs/testing` aparece em **1** dos 59 specs; o resto instancia classes com mocks à mão, e não há teste de integração HTTP nem Postgres no CI. Uma regressão de container DI ou de adapter Express passaria verde. A aceitação precisa incluir roteiro manual pelo `ops/qa-safari/`: login, cadeia de guards, throttling e os quatro endpoints de upload.
- **Status:** ABERTO — **adiado por decisão do usuário em 2026-07-31**, depois de a superfície acima ter sido levantada. Segue precisando de data acordada.
- **Relacionado:** PROB-0068, PROB-0069, PROB-0071

### BACKLOG-0041 — GATE DE DEPLOY: rodar `db:verify` contra produção antes de subir
- **Prioridade:** P0
- **Área:** banco / infra
- **Motivo:** **nenhuma verificação contra o banco de produção foi feita nesta sessão.** Três problemas distintos deixam o estado de produção desconhecido: PROB-0059 (invariantes apagadas — em dev estavam **zeradas**, 0 de ~20 CHECKs), PROB-0060 (triggers `set_updated_at` ausentes) e PROB-0061 (infra de sync de `0008`/`0009` inexistente apesar de registrada como aplicada). E a lição transversal do PROB-0061 é que **`schema_migrations` não é evidência confiável do que existe no banco, em nenhum ambiente** — só a inspeção do catálogo do Postgres é. A ferramenta para isso passou a existir nesta sessão (`npm run db:verify`, read-only, parametrizado por `DATABASE_URL`).
- **Dependências:** acesso ao `DATABASE_URL` de produção; BUG-0021 (a ferramenta) já está pronto no working tree, **sem commit**.
- **Critério de aceite:** `db:verify` executado contra produção com saída registrada; para cada divergência encontrada, decisão explícita (aplicar `0031`, que é idempotente e aditiva, ou tratar como incidente). Só então o deploy segue.
- **Risco se ficar pendente:** subir para produção sem saber se o banco tem CHECKs de `version > 0` (base do controle de concorrência otimista), índices únicos que impedem comissão duplicada, triggers de `updated_at` e as tabelas de sync. Se qualquer um faltar, a falha aparece como corrupção silenciosa de dado real, não como erro.
- **Escopo acumulado (2026-07-29):** produção segue **nunca verificada**, e agora há três migrations à frente dela. O checklist de `0037` está em [REVIEW_REPORTS/2026-07-29_fix_pendencias-auditoria.md:184-189](REVIEW_REPORTS/2026-07-29_fix_pendencias-auditoria.md); o de `0038` é a pré-checagem de duplicata de pedido externo em **BACKLOG-0062**, que é a única capaz de **abortar** a migration e por isso tem de rodar antes da janela de deploy. Este item continua sendo o gate geral; BACKLOG-0062 é o gate específico da `0038`.
- **Status:** ABERTO
- **Relacionado:** PROB-0059, PROB-0060, PROB-0061, BUG-0020, BUG-0021, BACKLOG-0062

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

### BACKLOG-0047 — Importação CSV de Pedidos
- **Prioridade:** P2
- **Área:** backend / frontend
- **Motivo:** a rodada de import CSV entregou Produtos, Fornecedores, Transporte e Clientes (entidades planas com upsert por chave natural). Pedidos ficou de fora por ser estruturalmente diferente: número gerado por sequence (`pedidos_numero_seq`), quatro FKs (cliente/vendedor/fornecedor/transportadora), itens aninhados (`order-item`) e totais recalculados por `order-calculation.ts` — não cabe no padrão `importCnpjEntity`.
- **Dependências:** decisão de formato do arquivo (uma linha por item com cabeçalho do pedido repetido **vs.** só cabeçalho sem itens); política de resolução de FKs por CNPJ/código e de numeração (usar `numero_pedido` externo vs. sempre gerar novo).
- **Critério de aceite:** endpoint `POST /pedidos/importacao` que agrupa itens por chave do pedido, resolve FKs no tenant, recalcula totais pelo cálculo canônico, acumula erros por linha sem interromper, e respeita isolamento tenant; tela com dialog e tabela de resultado; testes cobrindo agrupamento, FK inexistente e recálculo.
- **Risco se ficar pendente:** carga inicial de pedidos continua manual; baixo impacto operacional imediato.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0046

### BACKLOG-0048 — Auditar `UNIQUE(tenant_id, id)` nas tabelas anteriores à `0021`
- **Prioridade:** P2
- **Área:** banco / segurança
- **Motivo:** `itens_pedido` não tinha esse índice, e por isso o PostgreSQL recusou a FK composta de tenant vinda de `pedido_fotos` (PROB-0073). O índice é o **alvo exigido** por toda FK `(tenant_id, x) -> (tenant_id, id)` — sem ele, a próxima feature que precisar referenciar uma tabela antiga esbarra no mesmo erro, e o atalho (criar a FK só por `id`) abriria referência cross-tenant.
- **Dependências:** nenhuma. `0034` já resolveu o caso de `itens_pedido`.
- **Critério de aceite:** levantamento de todas as tabelas tenant-scoped sem `UNIQUE(tenant_id, id)`; migration criando o índice onde faltar; **`db:verify` passa a checar essa invariante** (hoje ele valida CHECKs, índices únicos parciais, tabelas e triggers — não este índice), de modo que a lacuna falhe no gate em vez de só aparecer na próxima FK.
- **Risco se ficar pendente:** o mecanismo de isolamento multi-tenant no nível do banco continua indisponível para as tabelas antigas, e a falha só se manifesta no meio de uma implementação futura.
- **Status:** **FECHADO (2026-07-29)** — fechado por BACKLOG-0052. Nota: o levantamento apontava nove tabelas porque foi feito num banco onde `sync_outbox` não existia (drift de PROB-0059 no dev, corrigido em 2026-07-29). Com os objetos restaurados são **dez**; a décima é `sync_outbox`, isenta com justificativa escrita — fila drenada e apagada a cada pull, incapaz de ser alvo de FK por construção.
- **Relacionado:** PROB-0073, PROB-0011, PROB-0012, BACKLOG-0006, BACKLOG-0052

### BACKLOG-0049 — Validar fotos / pedido externo / SAC ponta a ponta contra PostgreSQL real pela UI
- **Prioridade:** P1
- **Área:** backend / frontend / banco
- **Motivo:** as três frentes de 2026-07-29 foram validadas por lint, build, 405 testes de backend (mock puro), 43 de frontend e por `db:migrate` + `db:verify` + smoke SQL das constraints em banco descartável. **Faltou o fluxo pela interface**, porque o banco de dev está bloqueado para migrar (PROB-0072). Vale lembrar que foi justamente o teste contra banco real — e não a suíte mockada — que revelou a FK impossível de `pedido_fotos` (PROB-0073).
- **Dependências:** ~~PROB-0072~~ **RESOLVIDO em 2026-07-29** — o banco de dev está em `0037` com `db:verify` limpo, e `pedido_fotos`, `chamados_sac` e `itens_chamado_sac` existem lá. **Este item está desbloqueado**; falta a validação manual pela UI, que é do usuário. **Atualização (2026-07-29, parte 3):** o dev está em **`0038`**, e o critério de aceite abaixo mudou de comportamento em três pontos — validar já contra o novo: (b) registrar **duas vezes** o mesmo número de pedido externo no mesmo fornecedor deve dar **409** citando o pedido que já usa o número (FIX-0012), e o mesmo número em **outro** fornecedor deve ser aceito; (c) a numeração de chamado é **por tenant**, 1, 2, 3 sem buracos (FIX-0013), e o papel impresso deve trazer a linha `DATA DE ABERTURA` (FIX-0019); (e) **novo** — usuário com `pedidos.ver` mas sem `pedidos.criar` deve ser barrado ao digitar `/pedidos/novo` na URL, e `/pedidos/externo` sem sufixo deve redirecionar para a lista (FIX-0017).
- **Critério de aceite:** (a) pedido interno com 3 fotos, duas nomeadas com o código de itens e uma com nome aleatório — vínculo automático nas duas primeiras, "não vinculada" na terceira, e as três no PDF; (b) pedido externo criado → liberado → nota fiscal parcial em `/faturamento` → status vira `parcialmente_faturado`, divergência bate com o valor informado e a comissão é gerada; (c) chamado SAC com 3 itens — numeração sequencial, TOTAL igual à soma das linhas, matriz de transições respeitada e papel impresso no layout do print; (d) usuário sem `sac.ver` não vê o item na sidebar **e** é barrado ao digitar `/sac` na URL.
- **Risco se ficar pendente:** ir para produção com três features cujo caminho real de request nunca foi exercitado — exatamente a classe de erro que PROB-0073 representa.
- **Status:** ABERTO
- **Relacionado:** PROB-0072, PROB-0073, BACKLOG-0028

### BACKLOG-0050 — Decidir concessão de permissões de SAC a `vendedor` e `financeiro`
- **Prioridade:** P3
- **Área:** backend / segurança
- **Motivo:** os 4 slugs novos (`sac.ver|criar|editar|deletar`) nasceram concedidos **apenas** a `admin` e `gestao` (migration `0035` + `DEFAULT_ROLE_PERMISSIONS`), por decisão conservadora e fail-closed. Na prática quem abre chamado de pós-venda tende a ser o vendedor que atende o cliente.
- **Dependências:** decisão de negócio do usuário.
- **Critério de aceite:** definição de quais perfis recebem quais slugs; se a decisão mudar o provisionamento automático, atualizar `shared/src/permissions/catalog.ts` + `catalog.spec.ts` (hoje há teste afirmando que `vendedor` e `financeiro` **não** recebem SAC) e migration de seed. Concessão pontual a um tenant pode ser feita pela tela de Perfis, sem código.
- **Risco se ficar pendente:** baixo — o módulo funciona; só admin/gestao enxergam. O risco é operacional (vendedor pede para alguém abrir o chamado por ele).
- **Dependência nova e dura (2026-07-29, parte 3):** **PROB-0078 tem de ser resolvido antes de conceder `sac.ver` a `vendedor`.** O chamado SAC não registra autoria e `findAll`/`findOne` do SAC não têm escopo de ownership de vendedor — não por esquecimento, mas porque **não existe a coluna pela qual filtrar**. No instante em que `sac.ver` for concedido pela tela de Perfis (o que **não exige código**), todo vendedor passa a ver os chamados de todos os vendedores do tenant. Conceder `sac.criar` sem autoria também deixa o registro sem trilha de quem abriu.
- **Status:** ABERTO
- **Relacionado:** PROB-0072, PROB-0078

### BACKLOG-0051 — Migrar fotos de pedido para bucket quando o volume justificar
- **Prioridade:** P3
- **Área:** banco / infra
- **Motivo:** as fotos são gravadas em `bytea` no PostgreSQL (`pedido_fotos.conteudo`) — decisão deliberada de 2026-07-29: zero infra nova, mesmo backup e mesma transação do pedido, soft delete e purga LGPD cobrindo a foto sem job externo. O custo é o peso no banco, hoje limitado por downscale no cliente, teto de 3 MB por foto e 10 fotos por pedido.
- **Dependências:** nenhuma técnica. O gatilho é volume: acompanhar `pg_total_relation_size('pedido_fotos')` e o tamanho do dump.
- **Critério de aceite:** implementação alternativa de storage gravando linhas novas com `storage_backend = 'r2'` e `storage_key` preenchido — **sem migrar dado existente** (as colunas e o CHECK `pedido_fotos_storage_check` já suportam os dois backends convivendo) e **sem alterar contrato de API nem telas**; expurgo do objeto remoto no soft delete e na purga LGPD, que hoje são cobertos de graça pelo banco.
- **Risco se ficar pendente:** crescimento do banco e do tempo de backup proporcional ao uso de fotos. Nenhum risco funcional.
- **Status:** ABERTO
- **Ressalva atualizada (2026-07-29):** o critério de aceite acima dizia que soft delete e purga LGPD "hoje são cobertos de graça pelo banco". Não eram (PROB-0075) e **passaram a ser** — mas por código, não de graça: a purga vem de `pii-registry.ts` + `0037` (`storage_backend = 'purgado'`) e a cascata do soft delete de `orders.service.ts` (BACKLOG-0055). Consequência para este item: **migrar para bucket agora exige trabalho explícito nos dois pontos** — o plano de purga em `pii-registry.ts` zera `conteudo` e `storage_key`, mas nada apaga o objeto remoto, e a cascata de soft delete idem. Revisar o critério de aceite para incluir o expurgo do objeto no bucket nos dois fluxos.
- **Relacionado:** PROB-0075, BACKLOG-0054

### BACKLOG-0052 — Migration `0036` (`UNIQUE(tenant_id, id)`) + invariante no `db:verify`
- **Prioridade:** P2
- **Área:** banco / segurança
- **Motivo:** a auditoria de 2026-07-29 fechou o levantamento pedido por BACKLOG-0048: nove tabelas tenant-scoped sem `UNIQUE(tenant_id, id)` (`comissoes`, `financeiro_movimentacao`, `inadimplencia`, `lgpd_requests`, `local_users`, `mobile_sessions`, `parceiros_comerciais`, `pii_audit_events`, `tenant_role_permissions`). Nenhuma é alvo de FK composta hoje, então é risco latente e não brecha ativa — mas é exatamente o que travou a `0034` (PROB-0073), e o `db:verify` continua cego para o invariante.
- **Dependências:** nenhuma. Migration `0036` e o trecho do verificador estão prontos em `docs/REVIEW_REPORTS/2026-07-29_audit_fotos-pedido-externo-sac.md` §6.1 e §6.3.
- **Critério de aceite:** `0036` aplicada (aditiva, idempotente, sem `BEGIN/COMMIT` próprio); `verify-schema.ts` ganha seção que reprova tabela tenant-scoped sem `UNIQUE(tenant_id, id)` **total** (índice único parcial não conta — `indpred IS NULL`); `db:verify` passa limpo em banco descartável migrado do zero. **Ordem obrigatória: a migration antes da checagem** — ligar a checagem primeiro reprova todo ambiente.
- **Risco se ficar pendente:** a próxima FK composta contra uma dessas tabelas falha com SQLSTATE 42830 no meio de uma implementação, e o atalho (FK só por `id`) abriria referência cross-tenant.
- **Ponto a decidir na implementação:** `pii_audit_events` e `mobile_sessions` são tabelas de escrita alta; um índice único a mais pesa em `INSERT`. O escopo "todas as nove" foi decidido em favor da uniformidade do invariante.
- **Status:** **FECHADO (2026-07-29)** — `0036_unique_tenant_id.sql` aplicada e `verify-schema.ts` com **duas** seções novas: `[5/6]` FKs para tabela de tenant sem `tenant_id` na chave (a violação de isolamento em si, que o PostgreSQL não impede; hoje 0 casos, 26 FKs compostas) e `[6/6]` a prontidão `UNIQUE(tenant_id, id)`. A query de §6.3 foi corrigida em dois pontos antes do uso: `indnkeyatts` no lugar de `indnatts` (em PG11+ `indnatts` conta chave **mais** colunas INCLUDE) e `indisvalid AND indisready` (índice inválido de `CREATE INDEX CONCURRENTLY` abortado satisfaria a busca). Evidência: `db:verify` reprovou as nove antes da migration e passou limpo depois, em `renowa_fix` provisionado do zero e no banco de dev.
- **Relacionado:** PROB-0073, BACKLOG-0048, BACKLOG-0006

### BACKLOG-0053 — Testes de integração HTTP dos caminhos que nunca foram exercitados
- **Prioridade:** P1
- **Área:** backend
- **Motivo:** a auditoria de 2026-07-29 confirmou por leitura que os pontos suspeitos (hidratação de `item_uuid`, `select: false` do `conteudo`, `StreamableFile` + interceptor, `@Body('item_uuid')` em multipart, rotas de pedido externo) estão corretos — mas **nenhum rodou por HTTP**. A suíte atual mocka o QueryBuilder inteiro (`order-photos.service.spec.ts:39-43`, `getMany` devolve `[]`), então a hidratação da relação `item` não tem cobertura nenhuma. Se ela quebrar numa atualização de TypeORM, toda foto vinculada passa a aparecer como "não vinculada" na UI e no PDF, **em silêncio**.
- **Dependências:** nenhuma — `supertest` já é devDependency do backend. Não depende de PROB-0072 (usa banco descartável, não o de dev).
- **Critério de aceite:** testes de integração cobrindo (a) `GET /pedidos/:uuid/fotos` devolvendo `item_uuid` preenchido para foto vinculada e `null` para não vinculada, contra PostgreSQL real; (b) `GET …/fotos/:fotoUuid/conteudo` com bytes idênticos ao enviado e os headers `Content-Type`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff` e `Cache-Control`; (c) `POST …/fotos` multipart com `item_uuid` chegando ao handler; (d) a listagem **não** trazendo `conteudo`; (e) `POST /pedidos/externos` e `PUT /pedidos/externos/:uuid` resolvendo para os handlers certos.
- **Risco se ficar pendente:** a classe de defeito silencioso que a auditoria só conseguiu descartar lendo o fonte de `node_modules/typeorm` — insustentável como método de verificação.
- **Status:** ABERTO
- **Dependência nova explicitada (2026-07-29):** o `ci.yml` **não tem** `services: postgres`, e `backend/jest.config.js` usa `rootDir: 'src'` com `testRegex: '.*\\.spec\\.ts$'` — um teste que precise de banco entra na suíte hermética e a quebra em qualquer máquina sem container. Precisa de config Jest separada **e** do serviço no CI, além de bootstrap de módulo e stub de auth. Sessão própria.
- **Escopo ampliado (2026-07-29, parte 3):** as rotas e invariantes novas da reverificação também seguem sem teste HTTP, e três delas só são verificáveis contra banco real: (f) 409 de pedido externo duplicado, provando que o **índice** barra (não só a guarda de aplicação) — hoje provado por smoke SQL manual em banco descartável, não por teste versionado; (g) numeração de chamado SAC por tenant sob concorrência — as 50 emissões paralelas foram um `xargs -P 10` de sessão, e nada as reproduz no CI; (h) teto de 10 fotos com dois uploads concorrentes, que é o único jeito de provar o `SELECT ... FOR UPDATE` do FIX-0011. As três são exatamente o tipo de garantia que a suíte mockada **não** pode dar.
- **Relacionado:** PROB-0072, BACKLOG-0049, BACKLOG-0061, FIX-0011, FIX-0012, FIX-0013

### BACKLOG-0054 — Registro executável de tabelas com PII, spec de `privacy.service.ts` e política de retenção
- **Prioridade:** P1
- **Área:** LGPD / backend
- **Motivo:** três tabelas novas (`pedido_fotos`, `chamados_sac`, `itens_chamado_sac`) ficaram fora do ERASURE sem que nada acusasse (PROB-0075), porque o SQL de `privacy.service.ts:69-98` é literal e o inventário de PII vive em prosa (`docs/LGPD_ARCHITECTURE.md:13-18`) — já desatualizado, sem `notas_fiscais`, `parceiros_comerciais` nem `transportadoras`. As constantes de `privacy.service.ts:9-12` parecem um registro mas só alimentam o audit log. Além disso, o único fluxo destrutivo do sistema **não tem spec**, e não existe job de retenção em lugar nenhum (`grep -rniE "Cron|@Interval|ScheduleModule"` em `backend/src` sem hit real) — `pii_audit_events` cresce sem limite.
- **Dependências:** os prazos de retenção seguem como pendência jurídica (`docs/LGPD_ARCHITECTURE.md:48-52`). O registro e a spec não dependem disso.
- **Critério de aceite:** registro em código das tabelas/colunas com PII, **dirigindo** o SQL de ERASURE e EXPORT em vez de conviver com ele; teste que falha quando uma tabela nova com `tenant_id` e coluna de texto livre não está classificada; spec de `privacy.service.ts` cobrindo os dois ramos (CLIENT e USER) contra banco real, incluindo `pedido_fotos` e as duas tabelas de SAC.
- **Risco se ficar pendente:** cada tabela nova repete a omissão, e o sistema continua afirmando na documentação uma cobertura de purga que o código não tem.
- **Status:** **PARCIAL (2026-07-29)** — escopo reduzido ao que resta.
- **Entregue:** registro executável `backend/src/privacy/pii-registry.ts` **dirigindo** o SQL de ERASURE (não mais convivendo com ele); `pii-registry.spec.ts`, que varre `*.entity.ts` e reprova a build se entidade com `tenant_id` não estiver classificada — puro `fs`, roda no CI atual sem banco; `privacy.service.spec.ts` cobrindo os dois ramos com mock de `manager.query`, escrita **antes** do refactor para provar equivalência do SQL das seis tabelas já cobertas; smoke contra PostgreSQL real provando que o SQL gerado não viola CHECK nem `NOT NULL`. `docs/LGPD_ARCHITECTURE.md` deixou de listar tabelas em prosa e aponta para o registro.
- **Resta:** (a) spec de `privacy.service.ts` contra **banco real** — o que existe é mock de `manager.query`, que assere o SQL emitido e não que ele faz o que promete no schema; (b) **política de retenção**, ainda inexistente: `pii_audit_events` cresce sem limite e não há `Cron`/`ScheduleModule` no backend. Prazos seguem como pendência jurídica.
- **Relacionado:** PROB-0075, PROB-0076, BACKLOG-0051, BACKLOG-0055

### BACKLOG-0055 — Soft delete não desce para `pedido_fotos` nem `itens_chamado_sac`
- **Prioridade:** P2
- **Área:** backend / banco
- **Motivo:** `optimisticSoftDelete` (`backend/src/common/persistence/optimistic-concurrency.ts:82`) marca **uma** linha. Excluído o pedido, `pedido_fotos` fica com `deleted_at IS NULL`; o mesmo vale para `itens_chamado_sac` quando o chamado é excluído (`sac.service.ts:241`). As FKs são todas `NO ACTION`. O ocultamento depende de cada query lembrar do filtro (`order-photos.service.ts:86`, `:216`, `:230`), então qualquer query nova que esqueça ressuscita os filhos. A guarda de `notas_fiscais` (`orders.service.ts:449-464`) mostra que o padrão foi reconhecido e não estendido.
- **Dependências:** nenhuma.
- **Critério de aceite:** exclusão de pedido marca `deleted_at` também nas fotos, e exclusão de chamado nos itens — ou guarda explícita equivalente à de notas fiscais; teste cobrindo os dois casos.
- **Risco se ficar pendente:** filhos órfãos ativos no banco, invisíveis só por convenção; e, no caso das fotos, bytes com PII sobrevivendo à exclusão do pedido (interage com PROB-0075).
- **Status:** **FECHADO (2026-07-29)** — `orders.service.remove` e `sac.service.remove` passaram a rodar em `dataSource.transaction`, com `manager.getRepository(...)` no `optimisticSoftDelete` (o repositório fica ligado ao manager e participa da transação) e um `UPDATE` de cascata logo depois, filtrando `deleted_at IS NULL` para não re-marcar filho já apagado e inflar `version`. A cascata vem **depois** do soft delete do pai: conflito de `version` aborta a transação e nenhum filho fica marcado sem o pai.
- **Ganho colateral:** `remove` de pedidos rodava fora de transação, com TOCTOU entre `countNotasAtivas` e o soft delete — uma nota emitida no intervalo passava despercebida. `countNotasAtivas` ganhou parâmetro opcional de `EntityManager` e a checagem entrou na mesma transação, fechando a janela.
- **Evidência:** `npm test --workspace=backend -- orders sac` → 83 passed, com casos novos para cascata das fotos, cascata dos itens de SAC, rollback em conflito de `version` e bloqueio por nota fiscal ativa sem marcar as fotos.
- **Relacionado:** PROB-0075, BACKLOG-0054

### BACKLOG-0056 — Frontend: erro 409 sem mensagem útil e timeout único para blobs
- **Prioridade:** P3
- **Área:** frontend
- **Motivo:** `getApiErrorMessage` (`frontend/src/lib/errors.ts:12`) não tem ramo para **409** e só aproveita `backendMessage` em 400/403 — "pedido já liberado" e "limite de 10 fotos atingido" (`order-photos.service.ts:168`, `:175`) chegam ao usuário como *"Recurso em uso — não pode ser removido"*, exibido direto no painel (`OrderPhotosPanel.tsx:77`). Separadamente, `getBlob` herda o timeout fixo de 10 s de `send` (`apiClient.ts:60`), e tanto os thumbs (`OrderPhotosPanel.tsx:47-50`) quanto o PDF (`PedidoDetalhe.tsx:86-89`) baixam todas as fotos em `Promise.all`.
- **Dependências:** nenhuma. O **formato** de erro do `getBlob` já está correto (`apiClient.ts:126` produz `{ response: { status, data } }`, que é o que `getApiErrorMessage` espera) — só o mapeamento de status e o timeout precisam de ajuste.
- **Critério de aceite:** 409 usa `backendMessage` quando existe; timeout de `getBlob` configurável e maior que o de JSON; teste cobrindo o mapeamento de 409.
- **Risco se ficar pendente:** o usuário recebe uma mensagem que descreve outra coisa, e o download de fotos pode abortar em rede lenta sem explicação.
- **Status:** **FECHADO (2026-07-29)** — 409 passou a usar `backendMessage || '<texto atual>'`, como 400/403; `ApiRequestOptions` ganhou `timeoutMs` e `requestBlob` passou a usar 30 s por padrão, contra os 10 s de JSON, porque thumbs e PDF baixam até 10 fotos em `Promise.all` compartilhando a mesma janela.
- **Correção ao enunciado:** `frontend/src/lib/errors.test.ts` **já existia** e continha `'mantém os textos fixos de 422/404/409'`, que fixava justamente o comportamento a corrigir — o teste protegia o defeito. Foi editado, não criado: 409 saiu do grupo de textos fixos e ganhou dois casos (com e sem `backendMessage`).
- **Relacionado:** nenhum

### BACKLOG-0057 — Paridade real dos testes de cálculo do SAC
- **Prioridade:** P3
- **Área:** backend / frontend / shared
- **Motivo:** a aritmética de `backend/src/sac/sac-calculation.ts` e `frontend/src/lib/sacCalculation.ts` é **idêntica** (auditoria de 2026-07-29 conferiu rounding, casas, ordem das operações e o total sobre já-arredondados). Mas o comentário de `frontend/src/lib/sacCalculation.test.ts:4-8` afirma que os casos de teste são os mesmos dos dois lados e **não são**: faltam no frontend `1.005 → 1.01` e string vinda do banco (`'2.500'`); falta no backend o caso de string vazia. Como os runners são diferentes (Jest / Vitest), nada força a sincronia — a garantia é uma afirmação que ninguém verifica. Há ainda uma divergência real de comportamento: o frontend coalesce `''` para 0 (`sacCalculation.ts:16`), o backend só coalesce nullish e `new Decimal('')` lança (`sac-calculation.ts:22-25`); hoje sem caminho de runtime porque o DTO exige `@IsNumber` (`create-sac-ticket.dto.ts:25,27`).
- **Dependências:** nenhuma.
- **Critério de aceite:** casos realmente espelhados — preferencialmente uma fixture única em `shared/` consumida pelos dois runners, para que a divergência quebre o build em vez de depender de disciplina; tratamento de `''` alinhado nos dois lados (ou o comentário corrigido para descrever a diferença deliberada).
- **Risco se ficar pendente:** baixo hoje. O risco é a afirmação falsa no comentário dar confiança indevida quando alguém alterar um dos lados.
- **Status:** **FECHADO (2026-07-29)** — fixture única `shared/src/sac/calculation-cases.ts` (dado puro, sem dependência de runner), re-exportada em `shared/src/index.ts` e iterada por Jest no backend e Vitest no frontend. Cobre os casos que faltavam de cada lado: `1.005 → 1.01`, string vinda do banco (`'2.500'`), string vazia, valor unitário arredondado antes de multiplicar e total sobre já-arredondados. O comentário falso do frontend foi reescrito para descrever o mecanismo real.
- **Divergência de comportamento alinhada:** o backend passou a coalescer `''` para 0. `?? 0` não cobre string vazia e `new Decimal('')` **lança** — sem caminho HTTP hoje (o DTO exige `@IsNumber`), mas um import de CSV ou migração chamando o service direto derrubava o servidor com 500 em vez de 400.
- **O critério de aceite exigia quebrar o build, e não quebrava:** o `ci.yml` rodava **apenas** `npm test --workspace=backend`. Sem isso a fixture seria teatro. Foram acrescentados `npm test --workspace=shared` e `npm test --workspace=frontend`, e o `AGENTS.md` passou a listar os dois nos comandos canônicos — antes só citava lint e build do frontend, espelhando a mesma lacuna.
- **Relacionado:** nenhum

### BACKLOG-0058 — Painel de fotos no formulário de pedido externo
- **Prioridade:** P3
- **Área:** frontend
- **Motivo:** `OrderPhotosPanel` é montado em `PedidoForm.tsx` e em `PedidoDetalhe.tsx`, mas **não** em `PedidoExternoForm.tsx` (confirmado por `grep -n OrderPhotosPanel frontend/src/pages/*.tsx`). O pedido externo aceita fotos pela API e as mostra no detalhe, então quem lança um externo só consegue anexar **depois** de salvar, indo ao detalhe — inconsistência com o pedido interno, onde o anexo faz parte do preenchimento.
- **Dependências:** nenhuma. O backend já aceita foto em pedido de qualquer origem, e o painel já sabe operar em modo somente-leitura.
- **Critério de aceite:** painel presente no formulário de pedido externo, editável nas mesmas condições do interno (pedido não liberado + `pedidos.editar`); nenhuma mudança de contrato de API.
- **Ponto a decidir:** no interno o painel só aparece depois de o pedido existir (a foto precisa de `pedido_id`). O externo tem a mesma restrição, então "no formulário" significa **na edição**, não na criação — ou a criação precisaria enfileirar os arquivos no cliente até o primeiro save, o que é escopo maior.
- **Risco se ficar pendente:** baixo, cosmético e de fluxo. Nenhum dado inacessível.
- **Status:** ABERTO
- **Relacionado:** [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md)

### BACKLOG-0059 — `SacTicketPdf` duplica o `StyleSheet` de `OrderValidationPdf`
- **Prioridade:** P3
- **Área:** frontend
- **Motivo:** os dois papéis impressos declaram estilos próprios com a mesma identidade visual. Mudança de fonte, margem, cor de cabeçalho ou logo precisa ser feita **duas vezes**, e nada acusa quando só uma é feita — o defeito aparece como dois documentos oficiais divergentes na mão do cliente.
- **Dependências:** nenhuma.
- **Critério de aceite:** base de estilo compartilhada (módulo próprio em `components/pdf/`), consumida pelos dois documentos, com **cada** desvio deliberado escrito como override explícito e comentado; nenhuma mudança visual em nenhum dos dois papéis (comparar o PDF gerado antes e depois).
- **Risco se ficar pendente:** baixo e crescente com o número de documentos. O próximo PDF do sistema tende a copiar o `StyleSheet` de novo.
- **Atualização (2026-07-30):** o defeito previsto aconteceu. O cabeçalho do PDF de pedido foi simplificado a pedido do cliente — `OrderValidationPdf` passou a imprimir só logo + `PEDIDO Nº X · data` (faixa de 46pt, `paddingTop` 72) e trocou a grade de cartões por células rótulo|valor no estilo da planilha do cliente. `SacTicketPdf` **não** foi alterado e continua com título grande, badge de status e nota "documento não fiscal" na faixa superior. Os dois papéis agora divergem de fato; o critério de aceite "nenhuma mudança visual" deve ser lido como "preservar o layout atual de **cada** documento, que não é mais o mesmo".
- **Status:** ABERTO
- **Relacionado:** FIX-0019

### BACKLOG-0060 — `@IsDateString` do DTO de pedido segue aceitando datetime (não apertado de propósito)
- **Prioridade:** P3
- **Área:** backend / mobile
- **Motivo:** a coluna `data` de `pedidos` é `date`, e `@IsDateString` aceita `2026-07-29T12:00:00Z`; o Postgres trunca a hora convertendo por fuso, então o dia gravado pode sair diferente do informado. É exatamente o defeito corrigido no DTO de SAC (FIX-0015), e **não** foi corrigido aqui **de propósito**: o pedido trafega no sync, e apertar a validação muda o contrato com o cliente mobile, que hoje pode estar enviando datetime.
- **Dependências:** exige olhar o que o `mobile/` envia de fato antes de apertar — e `mobile/` está fora de escopo nas sessões recentes por `AGENTS.md`.
- **Critério de aceite:** confirmado o formato que o mobile envia; se for data pura, `@Matches(/^\d{4}-\d{2}-\d{2}$/)` no DTO de pedido com teste; se for datetime, normalização explícita no servidor (truncar para data no fuso de negócio, não no do banco) em vez de recusa, para não quebrar aparelho em campo.
- **Risco se ficar pendente:** um pedido pode ficar gravado com a data do dia anterior dependendo do horário do lançamento. Silencioso e difícil de reproduzir depois.
- **Status:** ABERTO
- **Relacionado:** FIX-0015, PROB-0079

### BACKLOG-0061 — Testes de tela das três frentes (fotos, pedido externo, SAC)
- **Prioridade:** P2
- **Área:** frontend
- **Motivo:** até esta rodada havia **zero** teste de componente para as três frentes; `frontend/src/components/orders/OrderPhotosPanel.test.tsx` é o primeiro, e nasceu porque o laço de requisições do FIX-0008 **só era demonstrável por teste** — três leituras de código não o pegaram. A lição é direta: nesse tipo de defeito (efeito que se re-dispara, guarda de rota, estado que não converge) leitura não substitui execução.
- **Dependências:** nenhuma. `vitest` + `@testing-library/react` + `jsdom` já estão em uso, e o teste novo serve de modelo — inclusive o utilitário que deixa o event loop girar para expor laço de efeito.
- **Critério de aceite:** cobertura de (a) guardas de rota do FIX-0017 — usuário sem `pedidos.criar` barrado em `/pedidos/novo`, sem `sac.criar` em `/sac/novo`, e `/pedidos/externo` redirecionando; (b) formulário de pedido externo — campos obrigatórios e 409 de duplicata exibido com a mensagem do backend; (c) formulário de SAC — total da tela igual à soma das linhas, usando a fixture compartilhada de `shared/`; (d) coluna Origem da fila de faturamento distinguindo interno de externo.
- **Risco se ficar pendente:** a classe de defeito do FIX-0008 volta em qualquer painel novo que baixe binário, e as guardas de rota do FIX-0017 podem ser removidas num refactor sem que nada acuse.
- **Status:** ABERTO
- **Relacionado:** FIX-0008, FIX-0017, BACKLOG-0053, BACKLOG-0049

### BACKLOG-0062 — GATE DE DEPLOY: pré-checagem da migration `0038` em produção
- **Prioridade:** P0 — bloqueia o deploy que levar a `0038`
- **Área:** banco / infra
- **Motivo:** a `0038` cria `uq_pedidos_externo_numero`, índice único sobre dado **pré-existente**. É a única mudança da rodada capaz de **abortar a migration** em ambiente com dados: se houver pedido externo duplicado em produção, o `CREATE UNIQUE INDEX` falha e o `db:migrate` para. Isso é o comportamento desejado — a resolução de duplicata é decisão de negócio, não de schema — mas precisa acontecer **antes** da janela de deploy, não durante. Em dev não houve risco: **0 pedido externo e 0 chamado SAC**, nenhuma duplicata.
- **Dependências:** acesso a produção, que **nenhuma** sessão de 2026-07-29 teve. Produção nunca foi verificada contra `0037` **nem** `0038`.
- **Critério de aceite:** rodar em produção, **antes** de aplicar a `0038`, e registrar o resultado aqui:
  ```sql
  SELECT tenant_id, fornecedor_id, numero_pedido_externo, count(*)
    FROM public.pedidos
   WHERE origem = 'externo' AND deleted_at IS NULL
   GROUP BY 1, 2, 3 HAVING count(*) > 1;
  ```
  Zero linha → a `0038` é segura. Uma linha ou mais → **pare**, e a decisão de qual registro sobrevive é do usuário. Depois de aplicar: `db:verify` limpo, incluindo o CHECK `sac_numero_contador_ultimo_check` e o índice parcial novo, e conferir que `sac_numero_contador` foi semeado com o `MAX(numero_chamado)` de cada tenant que já tenha chamados.
- **Risco se ficar pendente:** deploy interrompido no meio da migration, em produção, com a resolução dependendo de uma decisão de negócio tomada sob pressão.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0041, FIX-0012, FIX-0013, [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md)


### BACKLOG-0063 — Foto escolhida na linha do item, no papel do pedido
- **Prioridade:** P1
- **Área:** banco / backend / frontend
- **Motivo:** o papel jogava **todas** as fotos numa seção em página separada, em grade de 3 colunas. Quem confere a mercadoria precisa ver a foto ao lado do código na **própria linha** do item, e precisa escolher qual foto de cada item vai ao papel — a escolha valendo para toda emissão futura, não só para a emissão atual.
- **Dependências:** migration `0039` (coluna `pedido_fotos.usar_no_papel`, CHECK e índice único parcial).
- **Critério de aceite:** (a) no pedido **interno**, cada linha de item imprime **uma** foto, na primeira coluna da tabela, com o código do item acima da imagem; (b) sem marcação explícita, cai na foto vinculada **mais antiga** do item, para o papel ser útil na primeira emissão; (c) a marcação é persistida e no máximo uma por item, garantido por índice, não por aplicação; (d) a seção "Fotos" em página separada deixa de existir no pedido interno e **permanece** no pedido **externo**, que não tem tabela de itens onde encaixar a foto; (e) foto não escolhida e foto solta não saem no papel do interno; (f) há como vincular foto a item pela tela — sem isso a foto cujo nome não casou com nenhum código fica órfã e invisível para sempre; (g) a emissão baixa só as fotos que vão ao papel.
- **Risco se ficar pendente:** conferência de mercadoria continua exigindo folhear páginas de fotos e cruzar código a olho.
- **Status:** FECHADO
- **Relacionado:** FIX-0021, [REVIEW_REPORTS/2026-07-30_fullstack_implementation_foto-na-linha-do-item.md](REVIEW_REPORTS/2026-07-30_fullstack_implementation_foto-na-linha-do-item.md)

### BACKLOG-0064 — Decidir se pedido liberado ou faturado pode ser excluído
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** `DELETE /pedidos/:uuid` de um pedido com status `liberado` devolve **204** e faz o soft delete. A guarda de `OrdersService.remove()` só barra pedido com **nota fiscal ativa**; o status em si não bloqueia nada. O roteiro de teste afirmava 409 e estava errado quanto ao comportamento atual — a afirmação foi corrigida no relatório da rodada. Nada foi alterado no código: **é pergunta de regra de negócio, não defeito confirmado.**
- **Dependências:** nenhuma. Decisão do usuário.
- **Critério de aceite:** decidir e registrar qual das três vale — (a) manter como está: só nota fiscal ativa bloqueia, e excluir pedido liberado é operação legítima de correção; (b) bloquear a partir de `liberado`, porque o papel já foi emitido e conferido, exigindo cancelar antes de excluir; (c) bloquear só de `faturado`/`parcialmente_faturado`, que na prática é quase o que a guarda de nota fiscal já faz. Se a escolha for (b) ou (c), a guarda entra em `remove()` com teste de cada status e o roteiro passa a afirmar 409.
- **Risco se ficar pendente:** baixo e conhecido — um pedido liberado pode ser excluído por engano sem nenhum obstáculo, e a única pista é o soft delete. Nenhum dado é destruído.
- **Status:** ABERTO
- **Relacionado:** [REVIEW_REPORTS/2026-07-29_teste-automatizado-safari.md](REVIEW_REPORTS/2026-07-29_teste-automatizado-safari.md)

### BACKLOG-0065 — Decidir onde o valor com imposto é arredondado
- **Prioridade:** P2
- **Área:** frontend + backend (contrato de cálculo)
- **Motivo:** `orderCalculation.ts:19-20` arredonda o valor **unitário** para 2 casas antes de multiplicar pela quantidade. Item de 4 unidades a R$ 25,50 com 10% de desconto e 10% de IPI: unitário com imposto 22,95 × 1,1 = 25,245 → 25,25 → linha 101,00, enquanto aplicar o IPI ao total da linha daria 100,98. No pedido de 2 itens medido em runtime, o total fechou em **202,00** em vez de 201,96, e o papel imprimiu `Total sem imposto R$ 183,60` com `IPI total R$ 18,40` — 10% de 183,60 é 18,36. Tela, API e PDF concordam entre si: a política está num único lugar e não há divergência interna. **Não é defeito, é escolha de arredondamento** — o problema é o cliente somar a coluna do papel e achar 4 centavos.
- **Dependências:** nenhuma. Decisão do usuário (possivelmente com o contador).
- **Critério de aceite:** decidir entre (a) manter o arredondamento no unitário, e então o papel passar a imprimir o IPI como diferença entre os totais em vez de sugerir percentual sobre a base; (b) arredondar só no total da linha, mantendo o unitário em precisão cheia, com o papel exibindo o unitário arredondado apenas para leitura. Escolhida a opção, `previewItem` e o cálculo do backend mudam juntos, com teste do caso 4 × 25,50 / −10% / +10% fixando o número esperado.
- **Risco se ficar pendente:** baixo em valor, médio em confiança — centavos por linha, mas num pedido grande a soma manual do papel não fecha e a conversa é com o cliente.
- **Status:** **FECHADO (2026-07-30)** — decisão do usuário: **opção (b)**, arredondar no **total da linha**, unitário em precisão cheia. `discountedRaw`/`taxedRaw` de `calculateOrderItem` ficaram em precisão cheia e `money()` passou a ser aplicado só em `total_item_sem_imposto`/`total_item_com_imposto`; `valor_com_desconto`/`valor_com_imposto` viraram **campos de leitura** declarados (exibição e persistência), nunca reusados na aritmética. `calculateOrderTotals` não mudou — continua somando linhas já arredondadas. `previewItem` do frontend espelha o backend.
- **Números fixados por teste:** 4 × R$ 25,50 com −10% e +10% de IPI → `valor_com_desconto` `22.95`, `valor_com_imposto` `25.25` (leitura), `total_item_sem_imposto` `91.80`, `total_item_com_imposto` `100.98`. Pedido de 2 itens iguais → `total_sem_imposto` `183.60`, `ipi_total` `18.36`, `total_com_imposto` `201.96`. Antes: 101,00 / 202,00 / 18,40 — o `IPI total` do papel não batia com o percentual sobre a base.
- **Divergência FE/BE encontrada de quebra, não prevista no enunciado:** `previewItem` **não normalizava a entrada**, enquanto o backend sempre normalizou (quantidades a 3 casas, preço e percentuais a 2, antes de qualquer conta). Era divergência real e sem teste dos dois lados. `previewItem` passou a normalizar igual, e `ItemInput` ficou opcional/nullable em todos os campos.
- **Como a paridade passou a ser forçada:** fixture única `shared/src/orders/calculation-cases.ts` (`ORDER_ITEM_CASES`, `ORDER_TOTALS_CASES`), no mesmo molde do BACKLOG-0057 no SAC, re-exportada em `shared/src/index.ts` e **iterada** por `backend/src/orders/order-calculation.spec.ts` (Jest) e `frontend/src/lib/orderCalculation.test.ts` (Vitest). Antes era **um** caso de cada lado, copiado à mão, e **nenhum** distinguia "arredonda no unitário" de "arredonda no total da linha" — por isso a política pôde divergir sem nada acusar.
- **Relatório de auditoria alinhado:** `backend/src/database/audits/order_calculation_divergences.sql` passou a usar `i.qtd_total` (persistida, já a 3 casas) em vez de `qtd_caixas * qtd_unitaria`, e `ROUND(...)` **por linha** em vez de arredondar só a soma. A fórmula já era a da política nova.
- **Residuais aceitos:** (1) `total_item` deixa de ser exatamente `qtd_total × valor_com_desconto` quando o unitário não é exato — trade-off da opção escolhida, e **nenhum CHECK no banco verifica essa coerência**; (2) o papel imprime o unitário em 2 casas, então a multiplicação manual da coluna `VLR. COM DESC.` diverge do `TOTAL S/IMP` da linha **quando o unitário com desconto não é exato** — o total da linha é o autoritativo (BACKLOG-0069, reclassificado como informativo depois da verificação em runtime: o papel **não tem** coluna de total com imposto por linha, então o `VLR C/ IMP` nunca é multiplicado); (3) **pedidos históricos não são regravados** (BACKLOG-0070).
- **Verificado em runtime (2026-07-30, BACKLOG-0068):** API, tela e papel confirmados nas três camadas — `183.60` / `201.96` com `IPI total R$ 18,36` no PDF extraído.
- **Relacionado:** FIX-0023, BACKLOG-0057, BACKLOG-0067, BACKLOG-0068, BACKLOG-0069, BACKLOG-0070, [PROB-0065](PROBLEM_LEDGER.md), [REVIEW_REPORTS/2026-07-30_teste-automatizado-safari-todas-as-telas.md](REVIEW_REPORTS/2026-07-30_teste-automatizado-safari-todas-as-telas.md), [REVIEW_REPORTS/2026-07-30_fullstack_fix_arredondamento-e-troca-de-fornecedor.md](REVIEW_REPORTS/2026-07-30_fullstack_fix_arredondamento-e-troca-de-fornecedor.md)

### BACKLOG-0066 — Trocar o fornecedor descarta os itens do pedido sem aviso
- **Prioridade:** P2
- **Área:** frontend
- **Motivo:** em `/pedidos/novo` e `/pedidos/:uuid/editar`, o `onChange` do `select` de fornecedor executa `setItems([newItem()])` (`PedidoForm.tsx:264`). Toda linha já digitada desaparece na hora, sem confirmação e sem mensagem. A intenção é coerente — a lista de produtos é a do fornecedor —, mas um pedido de 20 linhas se perde num clique errado e não há como desfazer. Encontrado em runtime: foi exatamente isso que apagou os itens preenchidos na primeira execução da suíte automatizada.
- **Dependências:** nenhuma.
- **Critério de aceite:** com pelo menos um item preenchido, trocar o fornecedor pede confirmação explícita ("os itens deste pedido serão descartados") e só limpa depois do aceite; cancelar mantém fornecedor e itens intactos. Teste de componente cobrindo os dois caminhos. Alternativa aceitável: preservar as linhas e apenas desvincular o `produto_uuid` de cada uma, marcando-as para revisão.
- **Risco se ficar pendente:** médio — perda de trabalho digitado, silenciosa, na tela de maior volume de digitação do sistema.
- **Status:** **FECHADO (2026-07-30)** — decisão do usuário: a **alternativa** do critério de aceite, **preservar as linhas e desvincular o produto**, sem diálogo de confirmação (a operação deixou de ser destrutiva, então não há o que confirmar). `handleSupplierChange(nextUuid)` substituiu o `onChange` inline: no-op se o fornecedor for o mesmo; linha **com produto** zera `produto_uuid`, `codigo_manual`, `descricao_manual` e `preco_unitario` e é marcada para revisão, **preservando** `uuid`, `qtd_caixas`, `qtd_unitaria`, `desconto_perc` e `ipi_perc`; linha **manual** (sem `produto_uuid`) fica intocada, porque não depende do fornecedor.
- **Ganho crítico além do enunciado:** preservar o `uuid` do item impede que o **PUT seguinte apague os itens no backend** (o PUT manda `itens` completo, e o comportamento antigo mandava uuids novos) e mantém os rótulos de foto do `OrderPhotosPanel`, que chaveia `itemLabels` por `item.uuid`. O comportamento antigo perdia os dois — em edição, não só em criação.
- **Marca explícita, não derivada:** `ItemForm` ganhou `precisa_produto: boolean`. Não é derivado de `produto_uuid` vazio porque **linha recém-adicionada também está sem produto e não é órfã**. `chooseProduct` e `updateItem` limpam a marca (escolher produto, ou digitar código/descrição — linha manual é válida). Sinalização: banner `role='status'` acima dos itens, destaque âmbar na linha e `aria-invalid` no select.
- **Bloqueio de submit sem regra nova:** reusa a validação que já existia em `submit()` ("Cada item precisa de um produto ou de código/descrição manual"). Nenhuma regra de validação foi acrescentada.
- **Teste:** `frontend/src/pages/PedidoForm.spec.tsx` — **primeiro teste de componente desta tela**. Cobre: preserva linhas e desvincula o produto; reselecionar o mesmo fornecedor é no-op; linha manual intacta; submit bloqueado com linha pendente e liberado ao escolher novo produto.
- **Verificado em runtime (2026-07-30, BACKLOG-0068):** confirmado ponta a ponta contra o backend real, incluindo o que o teste de componente **não podia** provar — os `uuid` dos itens persistidos são **os mesmos antes e depois** da troca de fornecedor e do save (`104dff6f-…`, `438fb7fa-…`), e o submit bloqueado **não** alterou o servidor.
- **Relacionado:** FIX-0024, BACKLOG-0061, BACKLOG-0068, [REVIEW_REPORTS/2026-07-30_teste-automatizado-safari-todas-as-telas.md](REVIEW_REPORTS/2026-07-30_teste-automatizado-safari-todas-as-telas.md), [REVIEW_REPORTS/2026-07-30_fullstack_fix_arredondamento-e-troca-de-fornecedor.md](REVIEW_REPORTS/2026-07-30_fullstack_fix_arredondamento-e-troca-de-fornecedor.md)

### BACKLOG-0067 — `calculateOrderItem` lança com string vazia, como o SAC lançava antes do BACKLOG-0057
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** `backend/src/orders/order-calculation.ts:26-31` normaliza com `new Decimal(value ?? 0)`. `?? 0` **não** cobre string vazia e `new Decimal('')` **lança** (`[DecimalError] Invalid argument:`, verificado nesta data). É exatamente a mesma classe de defeito já corrigida no SAC pelo BACKLOG-0057, e ficou **não corrigida** aqui porque a rodada de 2026-07-30 estava fechando a política de arredondamento e mexer na normalização de entrada no mesmo passe misturaria duas mudanças. O frontend **já** coalesce `''` para 0 (`orderCalculation.ts:13`), então os dois lados divergem no tratamento de vazio — a fixture compartilhada ainda não tem caso de string vazia justamente por isso.
- **Dependências:** nenhuma. O remédio e o teste já existem no SAC como modelo.
- **Critério de aceite:** `''` coalescido para 0 nas três funções de normalização (`quantity`, `money`, `percentage`), caso de string vazia acrescentado a `ORDER_ITEM_CASES` em `shared/src/orders/calculation-cases.ts` (passando a valer para os dois runners), e comentário registrando que a divergência foi alinhada.
- **Risco se ficar pendente:** hoje **não há caminho HTTP** — o DTO exige `@IsNumber`. Um import de CSV, uma migração de dados ou qualquer chamada direta ao service com campo vazio derruba a requisição com **500** em vez de 400. Latente, não alcançável hoje.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0057, BACKLOG-0065, FIX-0023

### BACKLOG-0068 — Verificação em runtime das mudanças de 2026-07-30 (arredondamento e troca de fornecedor)
- **Prioridade:** P2
- **Área:** frontend / backend / QA
- **Motivo:** as duas mudanças de 2026-07-30 foram provadas **só por teste automatizado** — `npx jest` (51 suítes, 565 passed, 1 skipped), `npx vitest run` (13 arquivos, 88 passed), `tsc --noEmit` e eslint limpos. **Não** houve execução com o app subido, **nenhum PDF foi gerado** e o roteiro de `ops/qa-safari/` não foi reexecutado. A mudança de arredondamento altera número impresso em papel entregue ao cliente, e a de troca de fornecedor altera o caminho de maior volume de digitação do sistema: as duas classes de defeito que a rodada anterior mostrou que **leitura e teste unitário não pegam** (o laço de requisições do FIX-0008 e o 400 dos filtros do FIX-0020 só apareceram em runtime).
- **Dependências:** app subido (skill `run-app`) e aba logada no Safari; o roteiro de `ops/qa-safari/` já cobre as telas.
- **Critério de aceite:** (a) pedido de 2 itens de 4 × R$ 25,50 com −10% e +10% criado pela tela fecha em **R$ 201,96** na tela **e** na resposta da API, com `total_sem_imposto` `183.60`; (b) papel gerado e extraído (`pdftotext -layout`) mostrando `Total sem imposto R$ 183,60`, `IPI total R$ 18,36` e `Total final R$ 201,96`; (c) em `/pedidos/:uuid/editar` de um pedido com itens persistidos, trocar o fornecedor preserva as linhas, exibe o banner, e o **save seguinte não apaga os itens no backend** nem perde os rótulos de foto — este é o ponto que o teste de componente não pode provar, porque não há backend no teste.
- **Risco se ficar pendente:** médio. O item (c) é o único caminho onde o defeito residual seria **perda de dado persistido**, e ele depende de integração real entre o PUT e o painel de fotos.
- **Status:** **FECHADO (2026-07-30)** — executado com app subido (Postgres em Docker `renowa-dev-postgres` :5433, backend :3000, frontend :5173) e **sessão real**: `osascript … do JavaScript … in tab N of window 1` na aba já logada do Safari, com as requisições saindo da aba e o cookie `HttpOnly` de sessão (`credentials: 'include'`). Sem framework de E2E — mesmo driver do relatório de teste de tela desta data.
- **(a) Confirmado — API e tela concordam:** pedido nº 19, criado por `POST /pedidos` com 2 itens de 4 × R$ 25,50, −10%, +10% → `total_sem_imposto "183.60"`, `total_com_imposto "201.96"`; item com `qtd_total "4.000"`, `valor_com_desconto "22.95"`, `valor_com_imposto "25.25"`, `total_item "91.80"`, `total_com_imposto "100.98"`. IPI derivado (com − sem) = **18.36**, e 10% da base (183,60) = **18.36** — batem. Tela `/pedidos/:uuid/editar` lida do DOM: rodapé `R$ 183,60` / `R$ 201,96` e linha 1 `4 cx × 1 un = 4 · Sem IPI: R$ 91,80 · Com IPI: R$ 100,98`, **idêntico à API**.
- **(b) Confirmado — papel gerado e extraído:** pedido nº 20, PDF pelo botão "Gerar PDF para validação", `pdftotext -layout` → `Valor bruto R$ 204,00` / `Desconto total R$ 20,40` / `Total sem imposto R$ 183,60` / `IPI total R$ 18,36` / `Total final R$ 201,96`. Antes da mudança: 18,40 e 202,00.
- **(c) Confirmado — e a regressão que apagava itens está morta:** em `/pedidos/:uuid/editar` de pedido com 2 itens persistidos, trocando Fornecedor A → B pelo select: continuam **2 itens**, com caixas `["4.000","4.000"]`, desconto `["10.00","10.00"]` e IPI `["10.00","10.00"]` idênticos; produto vazio nas duas linhas, `aria-invalid="true"` nos dois selects e o banner `O fornecedor mudou: 2 itens precisam de um novo produto. Quantidades e percentuais foram preservados.`. Submit com linha pendente → alerta `Cada item precisa de um produto ou de código/descrição manual.` e **o servidor não mudou** (2 itens, total intacto). Escolhido o Produto B nas duas linhas: banner some, IPI passa a `5.00` (vem do produto), código vira o do produto novo, quantidades preservadas; save redireciona para `/pedidos/:uuid`. **Os `uuid` dos itens ANTES são os mesmos DEPOIS** (`104dff6f-…`, `438fb7fa-…`) — que é a prova que o teste de componente não podia dar. Totais recalculados sob o fornecedor novo: `216.00` / `226.80` (4 × R$ 30,00, −10%, +5%), coerentes.
- **Limpeza:** todos os dados de teste (stamp `QA65594440`) removidos — 2 pedidos (`DELETE` com `?version=`), 2 produtos, 2 fornecedores, 1 cliente; a busca pelo stamp devolve **0** em pedidos, produtos, fornecedores e clientes, e o PDF baixado foi apagado.
- **Achado da execução:** o residual registrado em BACKLOG-0069 era **maior do que a realidade** — a coluna de total por linha do papel é a **sem** imposto. Corrigido lá.
- **Não coberto por esta execução:** o relatório SQL de auditoria **não** foi executado (BACKLOG-0070 segue aberto como está), produção segue **nunca verificada**, e o caminho de sync ([PROB-0065](PROBLEM_LEDGER.md)) **não** foi exercitado.
- **Relacionado:** BACKLOG-0065, BACKLOG-0066, BACKLOG-0049, BACKLOG-0069, BACKLOG-0070, FIX-0023, FIX-0024

### BACKLOG-0069 — Coluna unitária do papel não fecha com o total da linha quando o unitário com desconto não é exato
- **Prioridade:** P3 — informativo
- **Área:** frontend (documento impresso)
- **Enunciado original (2026-07-30) e sua correção:** este item nasceu afirmando que "quem multiplicar a coluna do papel obtém 4 × 25,25 = 101,00 contra 100,98 impresso". **Isso estava errado, e a verificação em runtime do BACKLOG-0068 corrigiu.** As colunas por item do papel são `VLR.TB` | `DESC.%` | `VLR. COM DESC.` | `IPI %` | `VLR C/ IMP` | `TOTAL S/IMP`. A coluna de **total por linha é a SEM imposto** (`OrderValidationPdf.tsx:150`, `item.total_item`), e `VLR C/ IMP` (25,25) é **unitário informativo: nunca é multiplicado nem totalizado no papel**. Não existe coluna de total com imposto por linha. Logo a divergência de 101,00 × 100,98 **não é uma conferência que o papel convide a fazer**.
- **O que de fato sobra:** a mesma classe de diferença existe na coluna que o papel **realmente** convida a multiplicar — `VLR. COM DESC.` × `QTD TOTAL` contra `TOTAL S/IMP` — e só quando o **unitário com desconto não é exato**. No caso medido em runtime ela não aparece, porque 22,95 × 4 = 91,80 **exato**. Mas o caso de dízima que está na fixture (`ORDER_ITEM_CASES`, 3 unidades de R$ 10,00 com 33,33%) imprime `VLR. COM DESC. R$ 6,67` e `TOTAL S/IMP R$ 20,00`, enquanto 6,67 × 3 = **20,01**. Verificado por cálculo direto sobre os valores da fixture, **não** observado em papel gerado.
- **Dependências:** nenhuma técnica. É decisão de apresentação, possivelmente com o contador.
- **Critério de aceite:** decidir entre (a) **manter como está** — o `TOTAL S/IMP` da linha é o valor autoritativo e o desvio só aparece com desconto de dízima (recomendado: é o estado atual, já documentado, e o papel medido fecha); (b) imprimir `VLR. COM DESC.` com 3–4 casas, o que faz a multiplicação fechar sempre mas polui a coluna; (c) suprimir a coluna `VLR C/ IMP`, que é informativa e foi a origem da leitura errada deste item. Escolhida a opção, a evidência é papel gerado **com item de desconto em dízima** e extraído com `pdftotext -layout`.
- **Risco se ficar pendente:** baixo. Centavos, só com desconto de dízima, e só para quem refaz a conta a partir da coluna unitária em vez de ler o total da linha.
- **Status:** ABERTO — **reclassificado para informativo em 2026-07-30** após a verificação em runtime.
- **Relacionado:** BACKLOG-0065, BACKLOG-0068, FIX-0023

### BACKLOG-0070 — Inventário e decisão sobre pedidos históricos divergentes
- **Prioridade:** P2
- **Área:** banco / negócio
- **Motivo:** a mudança de política do BACKLOG-0065 **não regrava pedido nenhum**. Pedidos gravados antes de 2026-07-30 seguem com os totais da política antiga (arredondamento no unitário) e passam a divergir do que o cálculo atual produziria — por centavos por linha. Efeito não óbvio: **abrir e salvar** um pedido antigo o recalcula inteiro sob a política nova, e o total persistido muda sem que o operador tenha alterado nenhum campo. O inventário de quem diverge é o relatório somente-leitura `backend/src/database/audits/order_calculation_divergences.sql`, que já foi alinhado à fórmula nova.
- **Dependências:** acesso ao banco (dev e produção). Produção nunca foi verificada — ver BACKLOG-0041 e BACKLOG-0062.
- **Critério de aceite:** rodar o relatório em dev **e** em produção e registrar aqui a contagem de pedidos divergentes; decidir entre (a) não fazer nada, aceitando que o histórico ficou na política antiga; (b) regravar em lote, o que muda valor de pedido já faturado e exige contraparte contábil; (c) regravar só o que ainda está `em_aberto`. Se a escolha for (b) ou (c), a operação é migration com backup e não script solto.
- **Risco se ficar pendente:** baixo em valor e médio em confiança — reemitir o papel de um pedido antigo **depois** de alguém salvá-lo produz um total diferente do papel já entregue, sem nenhum registro do porquê.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0065, BACKLOG-0041, BACKLOG-0062, FIX-0023

### BACKLOG-0071 — Quatro implementações paralelas de `money()` e duas de `brl()`
- **Prioridade:** P3
- **Área:** backend / frontend / shared
- **Motivo:** a mesma regra de arredondamento monetário (`toDecimalPlaces(2, ROUND_HALF_UP)`) está escrita em **quatro** lugares — `backend/src/common/decimal`, `frontend/src/lib/decimal`, e as duas implementações de `sac-calculation` — e a formatação BRL (`brl()`) está duplicada nos **dois** PDFs. A rodada do BACKLOG-0065 mostrou o custo concreto: a política de arredondamento precisou ser alterada em dois arquivos que ninguém garante que sejam idênticos, e a divergência de normalização de entrada entre `previewItem` e `calculateOrderItem` existia **há tempo** sem nada acusar. A fixture compartilhada fecha a porta pelo teste; a duplicação de código continua aberta.
- **Dependências:** nenhuma. `shared/` já é consumido pelos dois lados (catálogo de permissões e as duas fixtures de cálculo).
- **Critério de aceite:** uma única fonte da regra de arredondamento em `shared/`, consumida por backend e frontend; `brl()` num módulo só, usado pelos dois documentos impressos; **nenhuma mudança de resultado** — as fixtures `ORDER_ITEM_CASES`, `ORDER_TOTALS_CASES` e as do SAC passam sem alteração de valor esperado.
- **Risco se ficar pendente:** baixo hoje, e é exatamente o risco que já se concretizou uma vez: a próxima mudança de política de arredondamento tem quatro lugares para lembrar e nenhum mecanismo que reprove esquecer um deles fora do que as fixturas cobrem.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0059 (mesma classe de duplicação, no `StyleSheet` dos PDFs), BACKLOG-0057, BACKLOG-0065

### BACKLOG-0072 — `pedido_item.total_com_imposto` é gravado e nunca lido em superfície nenhuma
- **Prioridade:** P3
- **Área:** backend / frontend
- **Motivo:** achado na auditoria de 2026-07-30 feita junto com o ajuste de cores da tabela do papel. `calculateOrderItem` produz `total_item_com_imposto` e `orders.service.ts:115` o persiste em `pedido_item.total_com_imposto`, mas **nenhuma superfície de leitura usa a coluna persistida**: o papel (`OrderValidationPdf.tsx`) não tem coluna de total de linha com imposto — só `TOTAL S/IMP`, que lê `item.total_item` —, e o "Com IPI" que aparece por linha na tela de edição vem do **recálculo client-side** de `previewItem` (`frontend/src/lib/orderCalculation.ts:37`), não do valor gravado. A coluna só é consumida internamente pelo backend, em `calculateOrderTotals`, para somar `total_com_imposto` do pedido. Efeito não óbvio: se um dia a coluna persistida divergir do que o cálculo produz (pedido antigo, escrita por outro caminho), nada na tela nem no papel denuncia — ver BACKLOG-0070, que documenta exatamente esse histórico divergente.
- **Dependências:** nenhuma. A decisão sobre a coluna `VLR C/ IMP` do papel em BACKLOG-0069 encosta neste item.
- **Critério de aceite:** decidir entre (a) **expor** — acrescentar coluna `TOTAL C/IMP` no papel lendo `item.total_com_imposto`, o que também dá base de conferência ao `IPI total` do rodapé; (b) **manter como está**, registrando aqui que a coluna é de uso interno do agregado e não de leitura; (c) **remover** da API de leitura, mantendo só no banco. Escolhida a opção, a evidência é papel gerado e conferido, ou o contrato de resposta atualizado com teste.
- **Risco se ficar pendente:** baixo. É campo correto e coerente, apenas invisível — o custo é de conferência: quem lê o papel não tem como fechar o `IPI total` do rodapé a partir das linhas.
- **Relacionado a este mesmo achado:** a linha do papel mistura bases — `VLR. COM DESC.` e `VLR C/ IMP` são **unitários** e `TOTAL S/IMP` é **total de linha**. É fiel à planilha do cliente e não é defeito, mas é a mesma raiz da leitura errada registrada em BACKLOG-0069.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0069, BACKLOG-0070, BACKLOG-0065

### BACKLOG-0073 — `0040:191` — `DISTINCT ON` sem desempate determinístico (corrigir só se a migration for reescrita)
- **Prioridade:** P3
- **Área:** banco
- **Motivo:** o bloco de migração de `pedido_fotos` para `produto_fotos` usa `SELECT DISTINCT ON (f.tenant_id, i.produto_id) ... ORDER BY f.tenant_id, i.produto_id, f.created_at DESC`. Falta `, f.id DESC`: duas fotos do mesmo produto com o **mesmo** `created_at` fazem o Postgres escolher arbitrariamente qual sobrevive, e a escolha pode variar entre execuções e entre ambientes.
- **Dependências:** nenhuma. **NÃO EDITAR `0040_produto_fotos.sql`** — a migration já está em `schema_migrations` e migration aplicada é imutável (AGENTS.md, PROB-0072); mudar o arquivo, inclusive só um comentário, trava `db:migrate` em todo banco que já a aplicou. `CHECKSUMS_SUPERSEDIDOS` não serve: `migrations-hygiene.spec.ts` só aceita diferença de controle de transação.
- **Critério de aceite:** no dia em que a `0040` for reescrita (limpeza de histórico de migrations, recriação de baseline), incluir `, f.id DESC` no `ORDER BY`. Até lá, este item é registro, não trabalho.
- **Risco se ficar pendente:** hoje **nulo na prática**. `pedido_fotos` está vazia (dev não tem a tabela; o gate de deploy manda conferir em produção no momento da aplicação), então o bloco não migra linha nenhuma. Desde a `0042` a coluna de destino do vínculo (`origem_pedido_id`) nem existe mais, e a própria `0042` **aborta** se alguma linha tiver sido migrada com vínculo — o cenário em que o desempate importaria para o deploy.
- **Status:** ABERTO
- **Relacionado:** PROB-0072, PROB-0075, PROB-0083

### BACKLOG-0074 — Unificar as demais entidades em `createIdempotente`
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** o helper `backend/src/common/persistence/idempotent-create.ts` existe desde a correção do P1-1 e **produtos é o único consumidor**. Hoje o mesmo reenvio encontra três comportamentos diferentes: pedidos e SAC respondem **409** para uuid repetido (`assertUuidLivre`, `orders.service.ts:140`); clientes, fornecedores e transportadoras não têm guarda nenhuma; produtos devolvem o existente sem gravar. O app de celular vai reenviar criação da fila offline — três contratos para a mesma operação viram três tratamentos na ponta do cliente.
- **Dependências:** nenhuma. O uuid estável já nasce com a intenção de criar em todas as telas (`useUuidDeCriacao`), então o lado do cliente está pronto.
- **Critério de aceite:** criação de cliente, fornecedor, transportadora, pedido e chamado SAC passando por `createIdempotente`; replay com o mesmo uuid devolve o existente sem gravar, e com payload divergente devolve o existente **sem** aplicar a divergência (decisão travada com o usuário); teste por entidade cobrindo replay e corrida (23505 relido por uuid).
- **Risco se ficar pendente:** a fila offline duplica ou falha conforme a entidade, e a diferença só aparece em campo.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0075

### BACKLOG-0075 — `Idempotency-Key` HTTP reusando `sync_mutation_inbox`
- **Prioridade:** P2
- **Área:** backend
- **Motivo:** fase 2 da idempotência, decidida com o usuário. `createIdempotente` (BACKLOG-0074) resolve criação por identidade da entidade, mas depende de cada tela mandar um uuid estável e não cobre operação que não seja criação. Um mecanismo de `Idempotency-Key` no nível HTTP, com **resposta cacheada por operação**, cobre web e mobile pelo mesmo caminho e não depende da disciplina de cada formulário. A infra de deduplicação já existe para o sync (`sync_mutation_inbox`) — reusar em vez de criar uma segunda.
- **Dependências:** BACKLOG-0074 (o comportamento por entidade precisa estar uniforme antes de embrulhar tudo num interceptor).
- **Critério de aceite:** header `Idempotency-Key` aceito nas rotas de escrita; a primeira execução grava chave + resposta; repetição dentro da janela devolve a resposta gravada **sem** reexecutar; chave repetida com payload diferente é recusada explicitamente; teste de concorrência com duas requisições simultâneas da mesma chave.
- **Risco se ficar pendente:** duplicação continua sendo problema de cada tela e de cada service, resolvido caso a caso.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0074, BACKLOG-0005

### BACKLOG-0076 — GATE DE DEPLOY das migrations `0040` / `0041` / `0042`: pré-checagens que têm de rodar ANTES da janela
- **Prioridade:** P0
- **Área:** banco / infra
- **Motivo:** as três entram no **mesmo deploy** e **duas delas abortam** por dado preexistente — mesma classe do BACKLOG-0062 (gate específico da `0038`), que existe justamente porque migration que aborta precisa de checagem antes da janela, não durante. Hoje as pré-checagens estão só no cabeçalho das migrations e em FIX-0026; sem item próprio, ninguém as roda. **Produção nunca foi consultada** — não há acesso a partir do ambiente de desenvolvimento.
- **Contexto que torna a `0040` perigosa:** produção roda o código **antigo**, com o painel de fotos do pedido e o endpoint de upload de pé. Entre agora e o deploy **alguém pode anexar foto**, e a `0040` faz `DROP TABLE public.pedido_fotos`. A contagem tem de ser feita **no momento da aplicação**, não antes — uma contagem de ontem não vale.
- **Dependências:** acesso ao `DATABASE_URL` de produção. BACKLOG-0041 continua sendo o gate geral (`db:verify`); este é o específico destas três.
- **Critério de aceite:** os quatro passos abaixo executados **em ordem**, com saída registrada:
  1. **Derrubar o código antigo ANTES de migrar**, não depois — enquanto ele estiver de pé, a contagem do passo 2 pode mudar entre a leitura e o `DROP`.
  2. `SELECT count(*) FROM pedido_fotos WHERE deleted_at IS NULL;` **no momento da aplicação**. Se `> 0`: **parar**. O `DROP TABLE` passa a destruir dado real, o desempate não determinístico do `DISTINCT ON` (BACKLOG-0073) passa a importar, e a `0042` vai abortar de qualquer forma — a decisão volta a ser de negócio.
  3. Pré-checagem da `0041` (o `CREATE UNIQUE INDEX` falha e para o `db:migrate` se houver duplicata; fundir ou renomear é decisão de negócio):
     ```sql
     SELECT tenant_id, fornecedor_id, codigo, count(*)
       FROM public.produtos
      WHERE codigo IS NOT NULL AND deleted_at IS NULL
      GROUP BY 1, 2, 3 HAVING count(*) > 1;
     ```
  4. Pré-checagem da `0042` (guarda própria, `RAISE EXCEPTION`): `SELECT count(*) FROM public.produto_fotos WHERE origem_pedido_id IS NOT NULL;` — só pode dar `> 0` se o passo 2 tiver dado `> 0`, é a segunda rede.
  - **Dump de `pedido_fotos` antes, de qualquer forma.** O cabeçalho da `0040` pede; **nada no runner obriga**.
- **Risco se ficar pendente:** perda irreversível de foto anexada a pedido em produção, ou deploy travado no meio (migration abortada) sem decisão preparada. Dev tinha 0 duplicatas de código em 2026-07-30 e `pedido_fotos` não existe lá — **isso não diz nada sobre produção**.
- **Status:** ABERTO
- **Relacionado:** BACKLOG-0041, BACKLOG-0062, BACKLOG-0073, PROB-0083, FIX-0025, FIX-0026

### BACKLOG-0077 — Verificar em navegador a permissão da foto para perfil com `produtos.criar` sem `produtos.editar`
- **Prioridade:** P3
- **Área:** segurança / frontend
- **Motivo:** o `PUT /produtos/:uuid/foto` aceita `produtos.criar` **OU** `produtos.editar` (`RequireAnyPermission`), e a tela usa a mesma regra — quem pode criar o produto define a foto dele. Está coberto por teste (`product-photos.permissions.spec.ts` trava a permissão dos quatro endpoints; `permission.guard.spec.ts` cobre o modo `any`, inclusive "sem metadata de modo, lista continua exigindo todas"), mas **nunca foi exercitado em navegador**: exige um segundo perfil e outra sessão, e a suíte de `ops/qa-safari` **não pode tocar `/login`** — derruba a sessão que ela usa (ver `AGENTS.md`).
- **Dependências:** um perfil de teste com `produtos.criar` e `produtos.ver`, **sem** `produtos.editar`, e uma forma de exercitá-lo sem derrubar a sessão da suíte (janela/perfil separado do Safari, ou execução manual).
- **Critério de aceite:** com esse perfil, o campo de foto **aparece** em `/produtos/novo`, o upload responde `200`, e o `DELETE` da foto responde `403` (apagar foto de produto existente continua sendo edição — rebaixar deixaria quem só cadastra apagar foto de qualquer produto).
- **Risco se ficar pendente:** baixo. O contrato está travado por teste nos dois lados; o que falta é a prova de que a tela e o guard concordam em sessão real.
- **Status:** ABERTO
- **Relacionado:** FIX-0025, [REVIEW_REPORTS/2026-07-31_fix_foto-de-catalogo-sem-titular-e-qa-sem-fase-morta.md](REVIEW_REPORTS/2026-07-31_fix_foto-de-catalogo-sem-titular-e-qa-sem-fase-morta.md)


# MetaRenowa P0 (21/07/2026)

- Implementado: contrato server-side de cálculo, migration dos campos, criação/edição transacional, integração de cadastros e PDF de validação.
- Validado: smoke real autenticado com PostgreSQL, criação/edição/reabertura e PDFs de 1, 10 e 70 itens.
- Infraestrutura pendente: sanear o baseline de `schema_migrations` no banco dev legado; o runner completo encontra tabelas preexistentes ao tentar aplicar `001_initial_schema.sql`.
- P1 preservado: Sintegra, aceite/assinatura digital, envio externo e regras financeiras avançadas. Detalhes em `docs/MetaRenowa.md`.

### BACKLOG-0078 — Push de sync não conhece o ator: nenhuma entidade tem checagem de ownership de vendedor
- **Prioridade:** P1
- **Status:** ABERTO
- **Origem:** achado ao fechar PROB-0065 (2026-07-31)
- **Contexto:** `SyncController.push` **já recebe** `@CurrentUser() user: RequestUser` e `SyncAuthorizationService` já calcula o conjunto efetivo de permissões — mas `SyncService.pushItems(dto.items, user.tenantId)` descarta os dois e leva só o tenant adiante. Consequência: um device de usuário `vendedor` pode empurrar item para o pedido de outro vendedor do mesmo tenant, coisa que a REST recusa (`isVendorOnly`/`vendorOwnershipWhere` em `orders/order-ownership.ts`). Não é regressão de PROB-0065 — é anterior, e vale para **todas** as entidades do sync, não só pedido.
- **Por que não foi feito junto:** fechar PROB-0065 exigia a máquina de estados e a derivação de totais; ownership é outro eixo. Ao extrair `orders/order-write.ts` a assinatura chegou a prever um `OrderActor`, e ele foi **removido** em vez de preenchido com um `sub` inventado — abstração meio-usada mente sobre a garantia que oferece.
- **O que fazer:** `SyncAuthorizationService.assertCanPush` devolver um `SyncActor { tenantId, sub, roles, permissions }` em vez de `void`; o controller repassar; `loadOrderForWrite` voltar a receber o ator e aplicar `vendorOwnershipWhere`; em CREATE de pedido pelo sync, forçar `vendedor_uuid = actor.sub`, espelhando `resolveHeader`. Custo de teste conhecido: uma asserção em `sync-authorization.service.spec.ts`, o argumento de `pushItems` em `sync.controller.spec.ts` e os literais `'tenant-1'` em `sync.service.spec.ts` atrás de um helper.
- **Aceitação:** device de vendedor recebe recusa terminal ao tocar pedido de outro vendedor, nos dois protocolos, com teste cobrindo v1 e v2.
- **Relacionado:** PROB-0065, FIX-0027

### BACKLOG-0079 — Item de sync cujo pedido pai ainda não chegou é classificado como não-retryable
- **Prioridade:** P2
- **Status:** ABERTO
- **Origem:** achado ao fechar PROB-0065 (2026-07-31)
- **Contexto:** um `itens_pedido` CREATE que chegue antes do `pedidos` CREATE do mesmo lote falha ao resolver o pai e vira `rejected`/`VALIDATION_FAILED`/`retryable: false` no v2 — estado terminal para uma falha que é **transitória**. O item é descartado logicamente quando bastaria tentar de novo depois do pai. É pré-existente (a resolução de FK sempre foi assim), não regressão do writer novo.
- **O que fazer:** distinguir "FK de pai ausente" das demais recusas de validação e classificá-la como `retryable`, com teto de tentativas; ou ordenar o lote por dependência antes de processar.
- **Aceitação:** lote fora de ordem converge sem perder item, com teste que empurre item antes do pai.
- **Relacionado:** PROB-0065, ADR_SYNC_PUSH_V2

### BACKLOG-0080 — Excluir pedido deixa os itens ativos: 81 órfãos no banco de dev
- **Prioridade:** P2
- **Status:** ABERTO
- **Origem:** achado na verificação em runtime de PROB-0065 (2026-07-31), ao conferir o estado do banco depois da limpeza do `ops/qa-safari`
- **Área:** backend / banco
- **Motivo:** `OrdersService.remove` marca `deleted_at` **só no pedido**. BACKLOG-0055 fechou exatamente essa classe para `pedido_fotos` e `itens_chamado_sac`, mas `itens_pedido` ficou de fora — e a cascata das fotos foi removida junto com a tabela na `0040`, então hoje o `remove` não tem cascata nenhuma. As FKs são `NO ACTION`.
- **Evidência (banco de dev, 2026-07-31):** `SELECT count(*) FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id WHERE i.deleted_at IS NULL AND p.deleted_at IS NOT NULL` → **81**, espalhados por pedidos antigos (5, 7, 8, 11, …). Não é regressão do trabalho de PROB-0065: são anteriores, e o comportamento é o mesmo desde sempre.
- **Impacto:** hoje é invisível, porque item só é lido através do pedido — o ocultamento depende de **toda** query lembrar do filtro. É a mesma dependência de convenção que BACKLOG-0055 removeu para os outros dois filhos. Uma query nova que liste `itens_pedido` direto (relatório, export, auditoria de cálculo) ressuscita linha de pedido excluído.
- **O que fazer:** estender ao `itens_pedido` a cascata que BACKLOG-0055 já implementou — `UPDATE` filtrando `deleted_at IS NULL`, **depois** do soft delete do pai, na mesma transação, para conflito de `version` abortar tudo. Decidir à parte o que fazer com os 81 já existentes (script de saneamento ou deixar como está, já que são invisíveis pelas queries atuais).
- **Aceitação:** excluir pedido marca os itens; teste cobrindo o caso, no molde do que já existe para SAC.
- **Status (2026-07-31):** **parte de código FECHADA** em FIX-0030 — a cascata entrou em `OrdersService.remove`, depois do soft delete do pai e na mesma transação, com dois testes (sai com bump de `version`; **não** sai quando o pedido dá conflito de `version`). **Dev saneado na mesma data**, por decisão do usuário: `UPDATE itens_pedido i SET deleted_at = CURRENT_TIMESTAMP, version = i.version + 1 FROM pedidos p WHERE p.id = i.pedido_id AND p.tenant_id = i.tenant_id AND i.deleted_at IS NULL AND p.deleted_at IS NOT NULL` → `UPDATE 81`; a contagem de órfãos foi de **81 → 0**, e os 5 itens ativos restantes pertencem a pedidos vivos. **Continua ABERTO só produção**, que nunca foi inspecionada quanto a isto — conferir na mesma janela de BACKLOG-0041, com a contagem antes de decidir se sanea.
- **Relacionado:** BACKLOG-0055, PROB-0065, FIX-0030

### BACKLOG-0081 — Validar o RBAC pela UI em navegador (a única parte de FIX-0031 que não foi exercitada)
- **Prioridade:** P1
- **Área:** frontend / segurança / QA
- **Origem:** FIX-0031 (2026-08-26) — backend e frontend passaram nos testes e a lógica foi provada contra o Postgres de dev por script, mas **nenhuma tela foi aberta**.
- **Motivo:** o `ops/qa-safari` exige uma aba do Safari **já logada** e a senha do admin de dev, que não estavam disponíveis na sessão. O app chegou a subir (backend 3000 + frontend 5173, ambos respondendo 200) e parou aí. FIX-0031 mexeu em rota, Sidebar, ~19 botões e em duas telas de configuração: é exatamente o tipo de mudança que teste unitário não reprova e a tela reprova.
- **Dependências:** aba do Safari logada + senha do admin de dev.
- **Critério de aceite:** rodar a fase **`p12`** (varredura de 15 telas) sem erro; e mais um roteiro de perfil, ponta a ponta: (a) criar um perfil sob medida em Perfis; (b) atribuí-lo a um **usuário novo** pela tela de Usuários — o que era impossível antes de FIX-0031; (c) editar nome e descrição em Perfis (`PATCH /roles/:id`, que só ganhou chamador agora); (d) tentar desativar um perfil **em uso**, esperando a mensagem de 409 com a contagem de usuários.
- **Risco se ficar pendente:** um gate errado numa rota ou num `<Can>` só aparece para quem usa. Falso negativo (esconder botão de quem podia) é bug de produto silencioso; falso positivo já é coberto pelo backend, mas custa 403 na cara do usuário.
- **Evidência de fechamento (2026-08-26):** executado no Safari com sessão real de `admin@renowa.local`, driver `ops/qa-safari` injetado na aba logada. `p12` → **15 telas, zero erro**, rodada duas vezes (antes e depois das correções que o próprio teste motivou). Roteiro de perfil cumprido nos quatro pontos do critério: (a) perfil sob medida criado pela tela de Perfis com 2 permissões; (b) **apareceu no select de novo usuário** e o usuário nasceu com ele, não com um template; (c) nome e descrição editados pelo diálogo via `PATCH /roles/:id`, permissões preservadas, botão do perfil de sistema `disabled`; (d) desativar perfil em uso **recusado na tela** com o texto `Perfil em uso por 1 usuário(s). Mova-os para outro perfil antes de excluir.` e o perfil intacto. Fechado o ciclo: usuário movido pela tela, desativação aceita, e SQL confirmando `active=false` + `deleted_at` + **0 vínculos**, com `usuarios.roles = ["vendedor"]` e `access_token_version` em 2. Banco restaurado ao estado pré-teste, resíduo zero.
- **O teste achou dois defeitos**, ambos introduzidos por FIX-0031 e corrigidos na mesma sessão: perfil do tenant com zero permissões voltou a ser oferecido sem aviso no select (o `viewer` do dev), e `VENDEDOR`/`vendedor` renderizavam o mesmo rótulo. Detalhe em FIX-0031; fixados por `frontend/src/lib/roleOptions.test.ts`.
- **Limite do que foi provado:** tudo rodou como `admin`, com as 32 permissões — o ramo **negativo** dos gates não foi exercitado. Ver BACKLOG-0085.
- **Status:** CONCLUÍDO (2026-08-26)
- **Relacionado:** PROB-0084, FIX-0031, BACKLOG-0085

### BACKLOG-0082 — Granularidade do catálogo de permissões: módulos inteiros sem slug e slugs grosseiros demais
- **Prioridade:** P2
- **Área:** backend / frontend / segurança
- **Origem:** decidido com o usuário como **fora de escopo** durante FIX-0031 (2026-08-26), depois da conferência item a item do catálogo (32 slugs em 11 módulos, sem drift entre `shared/src/permissions/catalog.ts`, migrations e decorators).
- **Motivo:** duas lacunas distintas. (a) **Não existe slug** para dashboard, importação, exportação e relatórios — por isso o Dashboard e o shell de `configuracoes` ficaram, em FIX-0031, apenas atrás de autenticação: não havia o que declarar. (b) Slugs **grosseiros demais**: `financeiro.editar`, `usuarios.gerenciar` e `faturamento.editar` cobrem operações de peso muito diferente — em faturamento, criar, editar e excluir nota compartilham um slug só, então quem pode corrigir uma nota pode apagá-la.
- **Dependências:** mexer no catálogo altera `catalog.spec.ts` e o **provisionamento de todo tenant** (templates de perfil), e exige migration para os slugs novos. Decidir antes se slug novo nasce concedido a algum template ou fail-closed para todos.
- **Critério de aceite:** slugs definidos para os módulos hoje descobertos; os três slugs grosseiros quebrados nas operações que realmente precisam ser separadas; templates atualizados com decisão explícita por perfil; migration aplicada; `catalog.spec.ts` e o teste de contrato do frontend (`lib/rbacContract.test.ts`) verdes; rotas de dashboard/configuracoes passando a declarar `permission`.
- **Risco se ficar pendente:** conceder uma capacidade obriga a conceder junto o que veio no mesmo slug — o admin não tem como expressar "pode faturar, não pode apagar nota". E módulo sem slug é módulo que só a autenticação protege.
- **Status:** ABERTO
- **Relacionado:** PROB-0084, FIX-0031, PROB-0058

### BACKLOG-0083 — Eliminar `usuarios.roles` (jsonb) e derivar o nome do perfil de `local_users.role_id`
- **Prioridade:** P2
- **Área:** backend / banco / segurança
- **Origem:** achado confirmado da auditoria de RBAC; decidido com o usuário como **fora de escopo** de FIX-0031 (2026-08-26).
- **Motivo:** o perfil de um usuário existe em dois lugares — `local_users.role_id` (a associação de verdade, que o `PermissionGuard` usa) e `usuarios.roles` (jsonb por **nome**, a cópia que vai para o JWT). Eram duas fontes de verdade sem sincronia: o rename de perfil não propagava e o token seguia carregando nome de perfil inexistente. FIX-0031 **sincronizou** (o rename propaga na mesma transação e bumpa `access_token_version`), mas a duplicação continua — e toda escrita nova precisa lembrar dela.
- **Dependências:** mexe em JWT, no conceito de SUPERADMIN, em `native-auth`, em `mobile-session`, e exige migration de **drop** da coluna. Nada disso é reversível barato.
- **Critério de aceite:** nenhum caminho de código lê `usuarios.roles`; o nome do perfil no token é derivado de `local_users.role_id` na emissão; SUPERADMIN continua funcionando; sessão mobile continua funcionando; migration de drop aplicada; teste de arquitetura impedindo a coluna de voltar a ser lida.
- **Risco se ficar pendente:** enquanto forem duas, qualquer caminho de escrita novo pode dessincronizar de novo, e o sintoma é permissão errada no token — o pior lugar para uma divergência silenciosa.
- **Status:** ABERTO
- **Relacionado:** PROB-0084, FIX-0031

### BACKLOG-0084 — Criar perfil com zero permissões é permitido e não avisa nada na UI
- **Prioridade:** P3
- **Área:** frontend / produto
- **Origem:** decidido com o usuário como **fora de escopo** de FIX-0031 (2026-08-26): segue permitido, sem alerta.
- **Motivo:** um perfil sem nenhum slug é criado sem qualquer sinal. Quem for atribuído a ele entra no sistema e toma 403 em toda tela — que é exatamente o sintoma operacional de PROB-0057, resolvido lá por outro caminho (vocabulário único de perfis). O comportamento é **correto** (fail-closed); o que falta é o aviso.
- **Dependências:** nenhuma. É aviso de UI, não regra.
- **Critério de aceite:** ao salvar um perfil sem permissão nenhuma, a tela de Perfis avisa que ninguém nesse perfil conseguirá usar o sistema, e pede confirmação. Criar continua possível.
- **Deixou de ser hipotético (2026-08-26):** a validação pela UI encontrou o `viewer` do banco de dev com **0 permissões** sendo oferecido no select de novo usuário sem nada indicar. FIX-0031 tratou o lado de **consumo** — o select agora rotula esses perfis como `— sem permissões` —, mas o lado de **criação** segue como descrito aqui: a tela de Perfis deixa salvar um perfil vazio calada.
- **Risco se ficar pendente:** baixo e recuperável — o admin edita as permissões e o usuário volta a funcionar. O custo é suporte e desconfiança na tela.
- **Status:** ABERTO
- **Relacionado:** PROB-0057, PROB-0084, FIX-0031, BACKLOG-0081

### BACKLOG-0085 — Provar o ramo NEGATIVO dos gates de RBAC: logar com perfil restrito
- **Prioridade:** P1
- **Área:** frontend / segurança / QA
- **Origem:** limite explícito de BACKLOG-0081 (2026-08-26). A validação pela UI rodou inteira como `admin`, que tem as 32 permissões.
- **Motivo:** rodar como admin prova que os gates de FIX-0031 **não escondem** nada de quem pode — e nada além disso. Nenhum `<Can>`, nenhuma `permission` de rota e nenhum filtro da Sidebar foi visto no ramo em que deveria barrar. É metade da asserção, e é a metade mais fácil: um `permission` com slug errado (`transportadoras.ver` escrito `transportadora.ver`, por exemplo) some com a tela para todo mundo **menos** para o admin, e nenhuma suíte reprova — `hasPermission` de slug inexistente só devolve `false`. O teste de contrato `lib/rbacContract.test.ts` cobre a existência do slug no catálogo, não o comportamento na tela.
- **Dependências:** um segundo login. Criar um perfil restrito (ex.: só `clientes.ver`) e um usuário nele, e abrir a sessão em janela privada para não derrubar a do admin.
- **Critério de aceite:** com um usuário que tem apenas `clientes.ver`: a Sidebar mostra **só** Dashboard e Clientes; digitar `/financeiro`, `/pedidos`, `/produtos`, `/fornecedores` e `/transporte` na URL redireciona em vez de renderizar; na tela de Clientes os botões **Importar** e **Novo Cliente** não aparecem; e o Dashboard não mostra "Novo Pedido" nem os blocos financeiros. Depois, conceder `clientes.criar` pela tela de Perfis e confirmar que os botões aparecem **sem** precisar de novo login além do refresh de `/auth/me`.
- **Risco se ficar pendente:** um gate escrito errado fica invisível até um usuário restrito reclamar de tela que sumiu — e a suspeita natural vai recair sobre o backend, que estará certo.
- **Evidência de fechamento (2026-08-26):** executado no Safari, com **duas sessões simultâneas**: o admin na janela normal e o usuário restrito numa **janela de navegação privada** (cookie jar separado — a sessão do admin não foi derrubada, e a autoria de cada janela foi confirmada por `/auth/me` antes de asserir qualquer coisa). Perfil `qa_restrito` criado com **um único slug**, `clientes.ver`, e um usuário nele. **25 asserções, todas verdes.**
  - **Sidebar (9 asserções):** renderizou exatamente `['/dashboard', '/clientes']`. Pedidos, Produtos, Fornecedores, Transporte, Financeiro, Faturamento e SAC **ausentes** — não escondidos por CSS, ausentes do DOM.
  - **URL digitada à mão (8 asserções):** `/financeiro`, `/pedidos`, `/produtos`, `/fornecedores`, `/transporte`, `/faturamento` e `/sac` **todas redirecionaram para `/dashboard`** em vez de renderizar; `/clientes` abriu normalmente. É o caminho que a Sidebar filtrada não cobre, e o `ProtectedRoute` cobriu.
  - **Botões (3 asserções):** na tela de Clientes — a única que ele pode ver — **"Novo Cliente" e "Importar" não aparecem** (falta `clientes.criar`), enquanto a lista em si renderiza normalmente. O Dashboard não oferece "Novo Pedido".
  - **Concessão em tempo real (1 asserção):** concedido `clientes.criar` ao perfil pela sessão do admin, os dois botões **passaram a aparecer na sessão restrita sem novo login** — só o recarregamento do contexto de auth. As permissões são resolvidas do banco a cada request, então não há janela de token velho para permissão **concedida**. A Sidebar seguiu com dois itens, correto: nenhum `*.ver` novo foi dado.
  - **Acordo com o backend (4 asserções):** na mesma sessão, `GET /clientes` → 200, e `GET /pedidos`, `GET /fornecedores` e `GET /roles` → **403**. A tela esconde exatamente o que a API recusa; o gate de UI não está mais adiantado nem atrasado em relação à autoridade.
  - Banco restaurado ao estado pré-teste (perfil, usuário, vínculos e refresh tokens removidos), resíduo zero conferido por consulta.
- **Status:** CONCLUÍDO (2026-08-26)
- **Relacionado:** BACKLOG-0081, FIX-0031, PROB-0084
