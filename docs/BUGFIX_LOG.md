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

### BUG-0008 — Cookies `Secure` fixos passam a depender do ambiente (`NODE_ENV`)
- **Problema relacionado:** PROB-0049
- **Data:** 2026-07-21
- **Área:** backend / infra
- **Sintoma:** Safari descartava silenciosamente os cookies de sessão em `http://localhost` porque `secure: true` era fixo; login retornava `204` mas o usuário nunca ficava autenticado (`GET /auth/me` sempre `401`), sem erro visível na tela.
- **Causa raiz:** `SECURE_COOKIES` era literal `true`, sem considerar que o Safari (diferente do Chrome) não trata `localhost` como origem confiável para o atributo `Secure`.
- **Correção aplicada:** `SECURE_COOKIES = process.env.NODE_ENV === 'production'`; comportamento em produção não muda (sempre HTTPS lá).
- **Arquivos alterados:** `backend/src/auth/cookie.util.ts:12`, `:19`, `:23`
- **Testes/validações executadas:** repetição do login no Safari após o fix — `POST /auth/login` → `204`, `GET /auth/me` → `200` com usuário autenticado, sessão persiste entre navegações. Nenhum teste automatizado novo (não existe `cookie.util.spec.ts`).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sem commit nesta sessão; sem teste automatizado de regressão cobrindo `secure` por `NODE_ENV`.
- **Commit:** pendente

### BUG-0009 — `ResponseInterceptor` volta a envolver entidades com coluna `data` (ex.: `Pedido`, `FinanceMovement`)
- **Problema relacionado:** PROB-0050
- **Data:** 2026-07-21
- **Área:** backend
- **Sintoma:** `GET /pedidos/:uuid` retornava o pedido sem o wrap `{data: ...}` porque a heurística "já embrulhado" do interceptor disparava só por a entidade ter uma coluna de domínio chamada `data`; `PedidoDetalhe.tsx` caía em erro mesmo com a API respondendo `200`.
- **Causa raiz:** condição `'data' in obj` (sem exigir `meta`) colidia com qualquer entidade tendo coluna `data`, não só com respostas paginadas `{data, meta}`.
- **Correção aplicada:** condição alterada para `'data' in obj && 'meta' in obj`, refletindo o shape real de `PaginatedResponse<T>`.
- **Arquivos alterados:** `backend/src/common/interceptors/response.interceptor.ts:34`
- **Testes/validações executadas:** repetição de `GET /pedidos/:uuid` no Safari após o fix — resposta chega envolta em `{data: {...}}`; `PedidoDetalhe.tsx` renderiza normalmente. Nenhum teste automatizado novo (não existe `response.interceptor.spec.ts`).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sem commit nesta sessão; sem cobertura de teste unitário para o interceptor (ver BACKLOG-0013); `GET /financeiro/movimentacoes/:uuid` (mesma coluna `data`) não foi testado diretamente, só presumido corrigido pela mesma mudança.
- **Commit:** pendente

### BUG-0010 — `updateStatus` de pedido volta a carregar relações (`itens`, `produto`, `cliente`) antes de responder
- **Problema relacionado:** PROB-0051
- **Data:** 2026-07-21
- **Área:** backend
- **Sintoma:** `PATCH /pedidos/:uuid/status` respondia `200` com sucesso, mas devolvia o pedido sem a relação `itens`; `PedidoDetalhe.tsx` quebrava com tela branca (`TypeError: undefined is not an object (evaluating 'order.itens.length')`).
- **Causa raiz:** `updateStatus` retornava direto o resultado de `optimisticUpdate` (`UPDATE ... RETURNING *` cru, só colunas da tabela `pedidos`), sem as relações que `findOne` carrega via `leftJoinAndSelect`.
- **Correção aplicada:** `updateStatus` chama `this.findOne(uuid, user)` após o `optimisticUpdate` confirmar sucesso, devolvendo o mesmo contrato de `findOne`.
- **Arquivos alterados:** `backend/src/orders/orders.service.ts:184-198`; `backend/src/orders/orders.service.spec.ts` (2 testes ajustados para usar `jest.spyOn(service, 'findOne')`)
- **Testes/validações executadas:** repetição da troca de status pelo Safari após o fix — `PATCH /pedidos/:uuid/status` → `200`, tela renderiza normalmente com itens presentes. Reportado pelo usuário: 8/8 testes de `orders.service.spec.ts` passam. **Não reexecutado por este agente** (ambiente sem `node`/`npm`).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sem commit nesta sessão; resultado de teste (8/8) não reverificado por este agente; não auditado se outros métodos de escrita que usam `optimisticUpdate`/`optimisticSoftDelete` diretamente têm o mesmo problema (ver BACKLOG-0014).
- **Commit:** pendente

### BUG-0011 — DTOs de query dedicadas por rota do Financeiro (fecha `forbidNonWhitelisted` derrubando 3 abas com 400)
- **Problema relacionado:** PROB-0053
- **Data:** 2026-07-21
- **Área:** backend
- **Sintoma:** `GET /financeiro/comissoes`, `GET /financeiro/parceiros`, `GET /financeiro/lancamentos` (usada pela aba "Custos") e `GET /financeiro/movimentacoes` retornavam `400 BAD_REQUEST` (`"property mes should not exist; property ano should not exist"` etc.) sempre que a UI enviava seus filtros próprios (`mes`, `ano`, `fornecedor_id`, `status`, `tipo`, `nome_parceiro`).
- **Causa raiz:** os 4 handlers misturavam `@Query() pagination: PaginationDto` (que faz o `ValidationPipe` validar a query string **inteira** contra uma DTO que só tem `page`/`limit`/`search`) com `@Query('mes')`, `@Query('ano')` etc. individuais na mesma assinatura. Com `forbidNonWhitelisted: true` (`backend/src/main.ts:34`), qualquer propriedade extra da query string é rejeitada com `400`, mesmo capturada à parte por um `@Query('x')` individual.
- **Correção aplicada:** criadas 4 DTOs em `backend/src/finance/dto/query-financeiro.dto.ts` (`LancamentosQueryDto`, `MovimentacoesQueryDto`, `ComissoesQueryDto`, `ParceirosQueryDto`), cada uma estendendo `PaginationDto` e declarando os campos de filtro como `@IsOptional() @IsString()`. Os 4 handlers de `finance.controller.ts` passaram a usar um único `@Query() query: XDto` no lugar da mistura de decorators; nenhuma mudança nos services.
- **Arquivos alterados:** `backend/src/finance/dto/query-financeiro.dto.ts` (novo); `backend/src/finance/finance.controller.ts` (rotas `findAll`, `findAllComissoes`, `findAllParceiros`, `findAllMovimentacoes`)
- **Testes/validações executadas:** `fetch` direto no Safari contra `GET /financeiro/comissoes?mes=7&ano=2026&limit=100` — `400` antes do fix, `200` depois; clique real nas abas Comissão, Parceiros e Custos com filtros aplicados, incluindo criação de um registro em cada aba. Reportado pelo usuário: `npm run test` do backend — 32 suites / 183 testes, 100% verde, incluindo `finance.service.spec.ts`. **Não reexecutado por este agente** (ambiente sem `node`/`npm`).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sem commit nesta sessão; resultado da suíte (32/183) não reverificado por este agente; não existe teste de nível controller/e2e passando pelo `ValidationPipe` real cobrindo o contrato HTTP dessas rotas — a ausência desse tipo de teste foi a razão do bug ter passado despercebido; não auditado se outros controllers têm a mesma mistura de `@Query() dto` + `@Query('x')` individuais.
- **Commit:** pendente

### BUG-0012 — `formatDate` compartilhado corrige data do pedido exibida com 1 dia a menos em `Pedidos.tsx`/`PedidoDetalhe.tsx`
- **Problema relacionado:** PROB-0054
- **Data:** 2026-07-21
- **Área:** frontend
- **Sintoma:** pedido com data `2026-07-21` no banco aparecia como "20/07/2026" na listagem de pedidos e na tela de detalhe.
- **Causa raiz:** `new Date(row.data).toLocaleDateString('pt-BR')` aplicado direto sobre string `YYYY-MM-DD` sem horário — interpretada como meia-noite UTC, recuando um dia ao formatar no fuso local (Brasil, UTC-3). Mesma classe de bug já corrigida antes só no `fmtDate` local de `Financeiro.tsx`.
- **Correção aplicada:** novo helper `formatDate` em `frontend/src/lib/format.ts`, usando `new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')` para forçar meia-noite local; `Pedidos.tsx` e `PedidoDetalhe.tsx` passaram a usar esse helper no lugar do `new Date(...).toLocaleDateString(...)` direto.
- **Arquivos alterados:** `frontend/src/lib/format.ts` (novo helper `formatDate`); `frontend/src/pages/Pedidos.tsx:57`; `frontend/src/pages/PedidoDetalhe.tsx:100`
- **Testes/validações executadas:** clique real no Safari antes/depois do fix (hot-reload do Vite) — "20/07/2026" antes, "21/07/2026" depois, em `/pedidos` e `/pedidos/:uuid`.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sem commit nesta sessão; `fmtDate` de `Financeiro.tsx` permanece duplicado em vez de consolidado com o novo `formatDate` (ver BACKLOG-0016); nenhum teste automatizado cobre `formatDate`.
- **Commit:** pendente

### BUG-0013 — `SUM(total_com_imposto)` zerava Evolução de Venda e Curva ABC porque o campo nunca é preenchido pelo fluxo real de criação de pedido
- **Problema relacionado:** PROB-0055
- **Data:** 2026-07-21
- **Área:** backend
- **Sintoma:** `GET /financeiro/dashboard` respondia `200`, mas os widgets "Evolução de Venda" (gráfico de linha, 6 meses) e "Curva ABC de Clientes" (ranking por receita) apareciam sempre zerados/"Nenhum dado" mesmo com pedido faturado real gravado no Postgres.
- **Causa raiz:** as duas queries de `getDashboard` calculavam receita com `SUM(total_com_imposto)`, mas `total_com_imposto` é campo opcional em `pedidos` e o fluxo real de criação de pedido do frontend (`frontend/src/pages/PedidoForm.tsx:156`) só envia `total_sem_imposto` no payload; `backend/src/orders/orders.service.ts:62` só grava `total_com_imposto` se vier explicitamente no DTO, então fica `NULL` sempre que a tela padrão de pedido é usada. Confirmado direto no Postgres: pedido real de R$ 2.999 com `total_com_imposto IS NULL`.
- **Correção aplicada:** trocado `SUM(total_com_imposto)` por `SUM(COALESCE(total_com_imposto, total_sem_imposto, 0))` na query de série mensal de vendas e na query de ranking de clientes para a Curva ABC.
- **Arquivos alterados:** `backend/src/finance/finance.service.ts:614` (query de `vendasMensaisRows`), `:625` (query de `curvaAbcRows`), dentro de `getDashboard`
- **Testes/validações executadas:** smoke test manual real via Safari (osascript) contra Postgres local (`renowa-dev-postgres`) logado como `admin@renowa.local` no tenant `94defbdd-3361-4481-a869-56d0e82d5c6d` — antes do fix os dois widgets apareciam zerados com pedido real no banco; depois do fix, "Evolução de Venda" e "Curva ABC de Clientes" passaram a exibir o valor real do pedido. Backend typecheck limpo; suíte completa do backend reportada pelo usuário como 32 suites / 183 testes, sem regressão (não reexecutada por este agente).
- **Resultado:** PASS
- **Ressalvas:** sem commit nesta sessão; não existe teste automatizado (unitário ou e2e) cobrindo especificamente este cenário (pedido com `total_com_imposto` nulo) para `getDashboard` — o bug só apareceu com dado real via smoke test, não seria pego por um teste unitário com dado sintético que já preenchesse os dois campos.
- **Commit:** pendente

### BUG-0014 — `SUM(COALESCE(...))` sem fallback final para `0` produzia `NULL` agregado e invertia a ordenação da Curva ABC de Clientes
- **Problema relacionado:** PROB-0055
- **Data:** 2026-07-21
- **Área:** backend
- **Sintoma:** ao corrigir o BUG-0013 numa primeira tentativa (`SUM(COALESCE(total_com_imposto, total_sem_imposto))`, sem `, 0` final), cliente sem nenhum pedido com valor preenchido (só pedidos cancelados/sem total) aparecia listado **antes** de cliente com receita real de R$ 2.999 na tabela "Curva ABC de Clientes" — ordem invertida em relação ao que uma curva ABC deveria mostrar (maior receita primeiro).
- **Causa raiz:** a query ordenava por `ORDER BY valor DESC`; quando `SUM(...)` de um cliente resulta em `NULL` (nenhuma linha contribui valor), o comportamento default do PostgreSQL para `ORDER BY ... DESC` é `NULLS FIRST`, colocando o `NULL` agregado antes de qualquer valor numérico real. Só foi percebido comparando a ordem renderizada na tela com os dados reais do Postgres via smoke test manual — não é o tipo de erro que um teste unitário com dataset sintético pequeno tende a pegar, pois exige um cliente concorrendo na mesma consulta sem nenhum valor agregável.
- **Correção aplicada:** `SUM(COALESCE(total_com_imposto, total_sem_imposto))` alterado para `SUM(COALESCE(total_com_imposto, total_sem_imposto, 0))`, eliminando o `NULL` agregado e corrigindo a ordenação `ORDER BY valor DESC`.
- **Arquivos alterados:** `backend/src/finance/finance.service.ts:625` (query de `curvaAbcRows`, dentro de `getDashboard`)
- **Testes/validações executadas:** smoke test manual real via Safari — antes do fix, cliente sem receita aparecia primeiro na Curva ABC; depois do fix, cliente com R$ 2.999 de receita real aparece primeiro, ordem corrigida.
- **Resultado:** PASS
- **Ressalvas:** sem commit nesta sessão; nenhum teste automatizado cobre o caso "cliente sem valor agregável concorrendo com cliente com valor real" na ordenação da Curva ABC — recomenda-se um teste de regressão dedicado a este cenário (ver BACKLOG).
- **Commit:** pendente

### BUG-0015 — `RadialBarChart` do gauge de Positivação sem domínio explícito sempre renderizava arco 100% preenchido
- **Problema relacionado:** PROB-0055
- **Data:** 2026-07-21
- **Área:** frontend
- **Sintoma:** o gauge "Positivação" em `Dashboard.tsx` sempre aparecia visualmente com o arco 100% preenchido, independente do valor real da métrica — confirmado visualmente antes do fix mesmo com valor de positivação diferente de 100%.
- **Causa raiz:** pré-existente do mock original (não introduzida nesta sessão, mas só ficou visível/relevante agora que a métrica passou a ser calculada a partir de dado real) — o `RadialBarChart` do Recharts em `frontend/src/pages/Dashboard.tsx` não declarava domínio explícito para o eixo angular. Sem isso, o Recharts escala o preenchimento do arco com base no valor máximo dos próprios dados plotados (que é o único ponto de dado, o próprio valor de positivação), então o arco sempre aparece 100% preenchido não importa se o valor é 0%, 50% ou 100% — o gauge nunca representou a porcentagem real.
- **Correção aplicada:** adicionado `<PolarAngleAxis type='number' domain={[0, 100]} angleAxisId={0} tick={false} />` dentro do `RadialBarChart`, fixando a escala do gauge em 0-100%.
- **Arquivos alterados:** `frontend/src/pages/Dashboard.tsx:19` (import de `PolarAngleAxis`), `:410` (uso dentro do `RadialBarChart`)
- **Testes/validações executadas:** smoke test manual real via Safari — antes do fix o arco aparecia sempre cheio; depois do fix, com positivação real de 50% (1 de 2 clientes com pedido no mês corrente), o arco passou a mostrar corretamente meio-preenchido. Frontend typecheck limpo.
- **Resultado:** PASS
- **Ressalvas:** sem commit nesta sessão; nenhum teste automatizado (snapshot/visual) cobre a escala do gauge — regressão futura (ex.: remoção acidental do `PolarAngleAxis`) só seria pega visualmente, não por teste.
- **Commit:** pendente

### BUG-0016 — KPI "Faturamento" do Dashboard passa a somar `pedidos` reais em vez de lançamentos financeiros manuais tipo 'Venda'
- **Problema relacionado:** PROB-0056
- **Data:** 2026-07-21
- **Área:** backend
- **Sintoma:** card "Resumo" do Dashboard mostrava "Faturamento" = `R$ 0` enquanto "Evolução de Venda" e "Curva ABC de Clientes", na mesma tela, mostravam uma venda real de R$ 5.834,00.
- **Causa raiz:** `getDashboard` calculava `totalVendas` a partir de `SUM(CASE WHEN m.tipo = 'Venda' ...)` sobre `financeiro_movimentacao` (lançamentos manuais), enquanto os demais widgets de venda somam direto de `pedidos`. Nenhum fluxo do sistema cria automaticamente um lançamento tipo 'Venda' ao fechar um pedido, então o KPI ficava sempre zerado com dado real de pedido.
- **Correção aplicada:** nova query somando `SUM(COALESCE(total_com_imposto, total_sem_imposto, 0))` de `pedidos` (`WHERE tenant_id = $1 AND deleted_at IS NULL AND status <> 'cancelado'`), adicionada ao mesmo `Promise.all` de `getDashboard`; `totalVendas` do retorno passou a usar esse resultado. `SUM(CASE WHEN m.tipo = 'Venda' ...)` removido da query de `movimentoRepo` por estar morto (a query segue alimentando `totalCustoFixo`/`totalCustoRotativo`, corretos e fora do escopo deste bug).
- **Arquivos alterados:** `backend/src/finance/finance.service.ts` (`getDashboard`)
- **Testes/validações executadas:** smoke test manual real via Safari (osascript) contra Postgres local, logado como `admin@renowa.local` no tenant `94defbdd-3361-4481-a869-56d0e82d5c6d` — antes do fix, `GET /api/financeiro/dashboard` retornava `"totalVendas":"0.00"`; depois do fix (hot-reload do `start:dev`), retornou `"totalVendas":"5834.00"`, batendo com `vendasMensais`/`curvaAbc`. Confirmado visualmente por reload real da tela no Safari. **Typecheck e suíte automatizada do backend não foram executados nesta sessão** (ambiente sem `node`/`npm` disponível para este agente).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** sem commit nesta sessão; validação restrita a smoke test manual (request/response real + screenshot), sem `tsc`/Jest reexecutados por este agente; não existe teste automatizado dedicado a este cenário em `getDashboard` (ver BACKLOG-0017); a troca de fonte de dado do KPI (pedidos em vez de lançamento manual) é uma decisão de negócio implícita que precisa confirmação do usuário/PO (ver BACKLOG-0018).
- **Commit:** pendente

### BUG-0017 — Dropdowns truncavam silenciosamente acima de 100 registros; novo `fetchAllPages` busca a lista inteira paginando
- **Problema relacionado:** —
- **Data:** 2026-07-21
- **Área:** frontend
- **Sintoma:** vários dropdowns de seleção deixavam de exibir registros quando a fonte passava de ~100 itens — fornecedores, transportadoras, produtos e a coluna "Responsável" (usuários) na tela de Auditoria sumiam da lista sem nenhum aviso. Caso adicional mais severo: o dropdown "Vendedor" no `PedidoForm` chamava `/users` **sem** `limit`, caindo no default do backend de 20 itens, então a partir do 21º vendedor o usuário simplesmente não aparecia para seleção.
- **Causa raiz:** os call sites carregavam a lista inteira numa única request com `limit` alto (`200`/`1000`) ou `limit: 100`, contando que o backend devolveria tudo de uma vez. O backend impõe teto de 100 itens por página (guard anti-abuso deliberado), então qualquer `limit` acima de 100 é silenciosamente rebaixado para 100 e o restante da lista nunca é buscado — truncamento sem erro. No caso do "Vendedor", a request nem enviava `limit`, herdando o default de 20 do backend.
- **Correção aplicada:** novo helper `frontend/src/lib/fetchAllPages.ts`, que pagina em lotes de 100 (`PAGE_SIZE = 100`, o teto do backend) até `meta.totalPages`, concatena e retorna a lista completa sem truncar; reutiliza `normalizeListResponse` de `frontend/src/lib/pagination.ts` para lidar com os formatos de resposta paginada. Os call sites de dropdown passaram a chamar `fetchAllPages` no lugar da request única com `limit` alto/ausente. Verificado em 4 telas / 8 chamadas: `ProdutoForm.tsx:43` (fornecedores); `configuracoes/AuditoriaPage.tsx:41` (users/Responsável); `ClienteForm.tsx:107` (transportadoras); `PedidoForm.tsx:82-85` (clientes, fornecedores, transportadoras, vendedores via `/users`) e `PedidoForm.tsx:103` (produtos filtrados por `fornecedor_uuid`). Fora de escopo intencionalmente: o teto de 100 do backend (mantido como guard anti-abuso deliberado — ver BACKLOG-0019) e as telas de listagem com paginação real (que devem continuar usando o serviço paginado direto, não `fetchAllPages`).
- **Ajuste de UX no mesmo pacote:** os droplists passaram a iniciar vazios — a primeira `<option value=''>` deixou de exibir o texto "Selecione" e ficou com rótulo vazio. Aplicado em 5 pontos: `PedidoForm` (Fornecedor, Vendedor), `ClienteForm` (UF), `Financeiro` (Fornecedor) e `configuracoes/PrivacidadePage` (Cliente — preservado o texto de loading "Carregando clientes...").
- **Arquivos alterados:** `frontend/src/lib/fetchAllPages.ts` (novo); `frontend/src/lib/fetchAllPages.test.ts` (novo); `frontend/src/pages/ProdutoForm.tsx`; `frontend/src/pages/configuracoes/AuditoriaPage.tsx`; `frontend/src/pages/ClienteForm.tsx`; `frontend/src/pages/PedidoForm.tsx`; `frontend/src/pages/Financeiro.tsx` (option vazia); `frontend/src/pages/configuracoes/PrivacidadePage.tsx` (option vazia)
- **Testes/validações executadas:** `npm run lint --workspace=frontend`, `npm run build --workspace=frontend` e `npm test --workspace=frontend -- fetchAllPages` — todos verdes. Teste unitário cobre paginação completa, concatenação das respostas e preservação dos filtros.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** smoke visual em Safari com stack no ar ainda **PENDENTE** — nenhuma verificação em runtime de que uma lista real com >100 registros passou a aparecer completa no dropdown, nem de que as options vazias renderizam como esperado (ver BACKLOG-0019); a solução faz N requests sequenciais por dropdown (uma por página de 100) — aceitável para os volumes atuais, mas cresce linearmente com o tamanho da lista.
- **Commits:** `4addfc9` (paginação completa + teste) e `d37b8e3` (dropdowns vazios)

### BUG-0018 — `SuppliersService.findAll` não filtrava `deleted_at IS NULL`; fornecedores soft-deletados vazavam na listagem
- **Problema relacionado:** —
- **Data:** 2026-07-22
- **Área:** backend
- **Sintoma:** encontrado incidentalmente durante a implementação do "Fluxo Comercial Completo" (Fase 3), não relacionado ao escopo da feature — `GET /fornecedores` podia retornar fornecedores já removidos (soft delete), diferente do padrão usado pelas demais listagens do sistema.
- **Causa raiz:** `backend/src/suppliers/suppliers.service.ts` (`findAll`) montava a query sem a cláusula `.andWhere('s.deleted_at IS NULL')` que o restante do backend usa por convenção em toda listagem sobre entidade com soft delete.
- **Correção aplicada:** adicionada a cláusula `.andWhere('s.deleted_at IS NULL')` na query de `findAll`, mesmo padrão já usado nas demais listagens do backend.
- **Arquivos alterados:** `backend/src/suppliers/suppliers.service.ts:30`
- **Testes/validações executadas:** reportado pelo implementador como parte da suíte completa do backend (236 testes) rodada ao final da Fase 3 — 100% verde. **Não reexecutado de forma independente por este agente** (`docs-reporter` não tem acesso a `node`/`npm` nesta sessão).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** validação da suíte completa não reverificada de forma independente por este agente. Confirmado via `git status` no momento deste registro: toda a implementação do "Fluxo Comercial Completo" (incluindo este fix) está **no working tree, sem nenhum commit** — `backend/src/suppliers/suppliers.service.ts` aparece como modificado e não staged.
- **Commit:** pendente

### BUG-0019 — `synchronize` do TypeORM deixa de ligar por `NODE_ENV`; passa a exigir `DB_SYNC=true` explícito
- **Problema relacionado:** PROB-0059
- **Data:** 2026-07-22
- **Área:** backend / banco / infra
- **Sintoma:** com `nest start --watch` rodando em dev, o `synchronize` do TypeORM apagou silenciosamente invariantes de banco criadas por migration SQL — **duas vezes**. Na reincidência confirmada nesta sessão, o schema `public` estava com **zero CHECK constraints** (as migrations declaram ~20), sem os 2 índices únicos parciais e sem os triggers `set_updated_at`.
- **Causa raiz:** `backend/src/app.module.ts` mantinha `synchronize: config.get('DB_SYNC') === 'true' || config.get('NODE_ENV') !== 'production'`, ou seja, ligado em todo ambiente que não fosse produção. `synchronize` remove qualquer objeto de banco sem equivalente em decorator TypeORM (CHECK constraints, índices parciais `WHERE ...`, triggers).
- **Correção aplicada:** `synchronize: config.get<string>('DB_SYNC') === 'true'` — só liga com a variável explícita, pensada para o 1º boot de um banco vazio. Comentário no próprio código explica **por que nunca reativar por `NODE_ENV`**, citando PROB-0059. Migrations SQL passam a ser fonte de verdade em **todo** ambiente. Verificado que `DB_SYNC` não está setado em nenhum `.env` nem no compose. O processo `nest start --watch` (PID 13091, rodando desde 12:14) foi encerrado.
- **Arquivos alterados:** `backend/src/app.module.ts:38-52`
- **Testes/validações executadas:** suíte completa executada nesta sessão — shared 8/8, backend 236/236 (38 suites), frontend 29/29; lint e build limpos nos três workspaces. Estado do bloco `synchronize` reverificado por leitura direta do arquivo por este agente.
- **Resultado:** PASS
- **Ressalvas:** com `synchronize` desligado em dev, provisionar um banco vazio passa a depender do migration runner, que tem problema conhecido ao encontrar tabelas preexistentes (BACKLOG-0039). **Produção não foi verificada** nesta sessão.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0020 — Migration `0031` restaura as invariantes de schema apagadas pelo `synchronize` (20 CHECKs, 2 índices parciais, 18 triggers)
- **Problema relacionado:** PROB-0059, PROB-0060
- **Data:** 2026-07-22
- **Área:** banco
- **Sintoma:** banco de dev com `checks=0` no schema `public`, sem os índices únicos parciais de `notas_fiscais`/`comissoes`/`lgpd_requests` e sem os triggers `trg_set_updated_at`. Objetos apagados incluíam as constraints `version > 0` de `0007`/`0009`/`0028` — **base do controle de concorrência otimista** —, os ranges percentuais de `itens_pedido` (`0024`), `access_token_version > 0` (`0023`) e os enums de `lgpd_requests`/`pii_audit_events` (`0010`/`0011`).
- **Causa raiz:** ver PROB-0059 (`synchronize:true`). Para os triggers, ver PROB-0060 — com a correção factual de que a **função `public.set_updated_at()` existia** (recriada por `CREATE OR REPLACE` na migration `0028`); faltavam só os triggers.
- **Correção aplicada:** nova migration `0031_restore_schema_invariants.sql`, **aditiva e idempotente por design** (guardas em `pg_constraint`/`pg_indexes`/`pg_trigger`), para poder rodar também em produção sem falhar nem duplicar. Duas decisões de projeto deliberadas: (a) as 4 constraints que nasceram `NOT VALID` **continuam `NOT VALID`** — promover a validado varre a tabela inteira e, como `runMigrations()` roda antes do `NestFactory`, uma linha histórica suja viraria falha de boot; (b) o guard do trigger é **por função, não por nome**, senão o bloco da `0020` renomearia `trg_notas_fiscais_updated_at`, que é legítimo.
- **Arquivos alterados:** `backend/src/database/migrations/0031_restore_schema_invariants.sql` (novo, não rastreado no git)
- **Testes/validações executadas:** migration testada **duas vezes em transação com `ROLLBACK`** antes de valer; a segunda passada é no-op (idempotência confirmada). Estado do banco de dev depois, **verificado por query própria**: `checks=20` (era 0), as 2 constraints originais do PROB-0059 presentes, os 2 índices parciais presentes, `trg_set_updated_at` em 17 tabelas + `trg_notas_fiscais_updated_at` = 18 triggers, `fk_notas=1` e `fk_comissoes=4` (**sem duplicação**).
- **Resultado:** PASS
- **Ressalvas:** **(1) ARMADILHA — ninguém deve "só rodar a migration de novo".** O `synchronize` **renomeou** as FKs compostas de `0028`/`0029` (`fk_notas_fiscais_tenant_pedido` → `FK_183ff04740a6e9633d5f305ef32`, etc.). As FKs existem e mantêm o par `(tenant_id, ...)` — isolamento preservado — mas os blocos `DO $$ IF NOT EXISTS (conname = 'fk_...')` de `0028`/`0029` **perderam idempotência contra esse banco**: reexecutar aqueles arquivos criaria FK duplicada. A `0031` foi construída evitando isso, e a ausência de duplicação foi confirmada por query. (2) As 4 constraints `NOT VALID` seguem sem validação de dado histórico — decisão separada, com janela própria. (3) **Produção não foi verificada.**
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0021 — `verify-schema.ts` + scripts `db:verify`/`db:migrate`: detector de drift de schema (não existia script de migration no projeto)
- **Problema relacionado:** PROB-0059, PROB-0060, PROB-0061
- **Data:** 2026-07-22
- **Área:** banco / infra
- **Sintoma:** o drift de schema do PROB-0059 só foi descoberto por inspeção manual do catálogo do Postgres, duas vezes. Não havia nenhuma forma automatizada de detectar que uma invariante declarada em migration não existia no banco. **Descoberta lateral:** não existia **script de migration nenhum** — o runner só era chamado no boot em produção (`backend/src/main.ts:13`).
- **Causa raiz:** ausência de ferramenta de verificação; `schema_migrations` era tratada como evidência do que existe no banco, o que PROB-0061 mostrou ser falso.
- **Correção aplicada:** novo `backend/src/database/verify-schema.ts` e scripts `db:verify` e `db:migrate` em `backend/package.json`. O `db:verify` compara **por estrutura, não por nome** (necessário porque o `synchronize` renomeia índice para `IDX_<hash>` e FK para `FK_<hash>`), é **read-only**, parametrizado por `DATABASE_URL`, e sai com código 0/1/2.
- **Arquivos alterados:** `backend/src/database/verify-schema.ts` (novo, não rastreado), `backend/package.json:12-13` (`db:migrate`, `db:verify`)
- **Testes/validações executadas:** executado contra o banco de dev nesta sessão, produzindo o inventário usado para confirmar a restauração de BUG-0020. Presença dos dois scripts reverificada por leitura direta de `backend/package.json` por este agente.
- **Resultado:** PASS
- **Ressalvas:** **ainda não foi executado contra produção** — é exatamente esse o gate pendente (BACKLOG-0041). O `db:verify` cobre as invariantes conhecidas; não é prova de equivalência total entre migrations e banco.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0022 — `status` removido do DTO de pedido (backend) e do payload do formulário (frontend): status deixa de ser gravável por POST/PUT
- **Problema relacionado:** PROB-0062
- **Data:** 2026-07-22
- **Área:** backend / frontend / segurança
- **Sintoma:** usuário com a role padrão `vendedor` (sem `pedidos.liberar`) mandava `{"status":"liberado"}` no `POST /pedidos` ou no `PUT /pedidos/:uuid` e contornava por completo o endpoint de liberação criado por este mesmo commit. Também dava para saltar direto a `"faturado"`, tirando o pedido da fila de `GET /faturamento/pedidos` sem existir nota fiscal nem comissão.
- **Causa raiz:** `backend/src/orders/dto/create-order.dto.ts:41` expunha `@IsOptional() @IsString() status?: string`, e `orders.service.ts:131`/`:203` faziam `status: dto.status ?? 'em_aberto'`. A constraint `pedidos_status_check` não protegia — `liberado` é valor válido do enum. `PATCH /:uuid/status` tinha sido corretamente travado em `cancelado`, mas POST e PUT ficaram abertos.
- **Correção aplicada:** campo removido do `CreateOrderDto` (e por herança do `UpdateOrderDto`), substituído por comentário explicando que `status` é derivado; `status: 'em_aberto'` fixo no create; `status` fora do `Object.assign` do update; `const { status: _status, ...headerFields } = header;` no `PedidoForm.tsx`. Status agora só muda por `PATCH /liberar`, `PATCH /status` (que só cancela) e pelo `FaturamentoService`.
- **Arquivos alterados:** `backend/src/orders/dto/create-order.dto.ts:41-43`, `backend/src/orders/orders.service.ts:131-132`, `:203`, `frontend/src/pages/PedidoForm.tsx:186-188`, `backend/src/orders/orders.service.spec.ts`
- **Testes/validações executadas:** suíte completa nesta sessão; `orders`+`faturamento` foram de 26 → **29 testes**, incluindo uma **guarda de regressão que falha se `status` voltar ao DTO**. Backend total esperado 239. Estado final do código reverificado por leitura direta por este agente.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** **ARMADILHA registrada** — `PedidoForm.tsx` fazia `...header` no payload e `header` contém `status`; com `forbidNonWhitelisted: true`, remover o campo só do DTO faria **todo save de pedido virar 400**. A correção teve obrigatoriamente que ser backend + frontend na mesma mudança. Sem smoke visual em navegador nesta rodada. **O caminho de sync continua permitindo escrever `status` direto na tabela (PROB-0065) — o bloqueio só é completo quando aquele for resolvido.**
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0023 — `DELETE /pedidos/:uuid` passa a recusar pedido com nota fiscal ativa; `faturamento` ganha `withDeleted` para sanear órfãos
- **Problema relacionado:** PROB-0063
- **Data:** 2026-07-22
- **Área:** backend
- **Sintoma:** soft delete de pedido deixava `notas_fiscais` e `comissoes` com `deleted_at IS NULL`, ainda somando em `faturamentoBruto`/fluxo de caixa, **e a nota ficava impossível de corrigir**: `atualizarNota` e `excluirNota` faziam `orderRepo.findOne` sem `withDeleted` e respondiam 404 permanente ("Pedido vinculado não encontrado.").
- **Causa raiz:** `backend/src/orders/orders.service.ts:304-308` — `remove()` chamava `optimisticSoftDelete` direto; a checagem de notas ativas tinha sido adicionada só em `updateStatus`.
- **Correção aplicada:** helper `countNotasAtivas()` extraído e aplicado também em `remove()` (409 quando há nota ativa) + `withDeleted: true` nos dois `findOne` de pedido em `faturamento.service.ts`, este último deliberadamente para permitir **sanear registros já órfãos** criados antes do fix.
- **Arquivos alterados:** `backend/src/orders/orders.service.ts:279`, `:308`, `:318`, `backend/src/faturamento/faturamento.service.ts:228-234`, `:295-301`, `backend/src/orders/orders.service.spec.ts`
- **Testes/validações executadas:** suíte completa nesta sessão; os 3 testes novos de `orders.service.spec.ts` são compartilhados com BUG-0022 (26 → 29 em `orders`+`faturamento`). Estado final reverificado por leitura direta por este agente (`countNotasAtivas` definido em `:308` e usado em `:279` e `:318`; `withDeleted: true` em `faturamento.service.ts:234` e `:301`).
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas:** os testes são **mock puro** — nenhum roda contra Postgres, então a interação real com FKs compostas e índices únicos parciais não é exercitada (BACKLOG-0028). O caminho de **sync** pode deletar pedido sem passar por essa guarda (PROB-0065). Nada commitado.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0024 — Importação de produtos migrada de `xlsx` para `papaparse` (só CSV), com limite aplicado durante o parse, `@Throttle` e detecção de encoding
- **Problema relacionado:** PROB-0069 (FECHADO), PROB-0068
- **Data:** 2026-07-22
- **Área:** segurança / backend / frontend
- **Sintoma:** `POST /produtos/importacao` recebia upload de usuário e o entregava a `xlsx@0.18.5`, lib com 2 advisories HIGH **sem versão corrigida no registry** (prototype pollution `GHSA-4r6h-8v6p-xvw6`, ReDoS `GHSA-5pgg-2g8v-p4x9`). Além disso, `IMPORT_MAX_ROWS` era conferido **depois** de `XLSX.read` + `sheet_to_json` materializarem o arquivo inteiro — DoS por planilha comprimida, com o limite de 5 MB do multer **sem proteger**, porque `.xlsx` é ZIP.
- **Causa raiz:** confirmada — dependência sem manutenção no caminho de correção do npm, exposta a input não confiável, com o bound de tamanho aplicado no lugar errado do pipeline.
- **Correção aplicada:** `xlsx` removido de `backend/package.json`; `papaparse@^5.5.4` (MIT, ~267 KB, **zero dependências transitivas**) + `@types/papaparse` no lugar; `IMPORT_ALLOWED_EXTENSIONS = ['csv']`. `normalizeImportRow`, o loop de upsert e o `ImportProductsResultDto` **não foram tocados** — a mudança é de camada de parse. Somado no mesmo trabalho: `preview: IMPORT_MAX_ROWS + 1` limitando **durante** o parse; `@Throttle({ default: { ttl: 60_000, limit: 5 } })` na rota; `decodeCsvBuffer` tratando BOM/UTF-8/Windows-1252; `delimiter: ''` para auto-detectar o `;` do Excel pt-BR.
- **Arquivos alterados:** `backend/src/products/products.service.ts` (`:5` import, `:13` extensões, `:31` `decodeCsvBuffer`, `:229-238` parse), `backend/src/products/products.controller.ts:30` (`@Throttle`), `backend/src/products/products.service.spec.ts`, `backend/package.json`, `frontend/src/pages/Produtos.tsx` (`:211`, `:216`, `:221`, `:225`), `frontend/src/services/products.service.ts`, `frontend/src/services/products.service.test.ts`
- **Testes/validações executadas:** suíte completa dos três workspaces nesta sessão — shared **8/8**, backend **260/260** (38 suites; baseline do commit era 236, **+24** somando esta correção e as demais da sessão), frontend **29/29**; lint e build limpos nos três. Testes específicos: 3 de encoding (UTF-8 puro, UTF-8 com BOM, Windows-1252), 2 de separador (`,` e `;`), 1 garantindo que 5000 linhas legítimas passam, 1 rejeitando `.xlsx`. `npm audit --omit=dev --workspace=backend`: **20 → 13**. Estado final reverificado por leitura direta por este agente.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas (as quatro que importam):**
  1. **MUDANÇA DE CONTRATO com impacto em usuário real:** `.xlsx` agora recebe **400** — `'Tipo de arquivo inválido. Utilize .csv (UTF-8).'`. **Quem já importava planilha `.xlsx` perde o fluxo.** A UI foi atualizada (accept, label, instrução "Salvar como > CSV UTF-8", colunas esperadas, limite de 5.000 linhas), **mas isso não substitui comunicar a mudança** — BACKLOG-0042. Shape do `ImportProductsResultDto` inalterado; **mobile não consome essa rota**.
  2. **ARMADILHA de import:** tem que ser `import * as Papa from 'papaparse'`. O `tsconfig` tem `allowSyntheticDefaultImports` **sem** `esModuleInterop` — `import Papa from` compila e **quebra em runtime**.
  3. **Nada rodou contra Postgres real** — os testes de import usam `manager` mockado; `dataSource.transaction` + upsert não foram exercidos contra banco (BACKLOG-0028). E **nenhum arquivo real exportado do Excel pt-BR foi usado**: os bytes foram simulados (BACKLOG-0045).
  4. **`preview` não limita memória.** O buffer inteiro é decodificado para string antes do parse, então o bound real continua sendo o limite de 5 MB do multer; o `preview` limita o array de linhas e o loop O(n), não a string. Streaming exigiria mudar a assinatura para `Readable` — não feito (BACKLOG-0046).
- **Nota de análise (verificada, não suposição):** prototype pollution via header `__proto__` no CSV **não é explorável** — o papaparse atribui string por bracket notation e `Object.entries` só lista own properties.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0025 — `parseImportPrice`: preço em formato pt-BR deixa de virar `NaN` na importação de produtos
- **Problema relacionado:** PROB-0070 (FECHADO)
- **Data:** 2026-07-22
- **Área:** backend
- **Sintoma:** bug **pré-existente** (não introduzido pelo commit `d91b9b3`): `Number(preco_base.replace(',', '.'))` transformava `"1.234,56"` em `"1.234.56"` → `NaN`. Na prática, **todo preço acima de mil exportado do Excel pt-BR era rejeitado** na importação em lote — exatamente nos produtos de maior valor.
- **Causa raiz:** confirmada — o `replace` trocava apenas a **primeira** vírgula e nunca removia o separador de milhar.
- **Correção aplicada:** helper `parseImportPrice` (`products.service.ts:55`), usado em `:288`. Regra: havendo os dois separadores, o mais à direita é o decimal e o outro é milhar; `NaN` para qualquer entrada que não seja estritamente numérica após a normalização.
- **Arquivos alterados:** `backend/src/products/products.service.ts:44` (`THOUSANDS_GROUPED`), `:55` (`parseImportPrice`), `:288` (uso), `backend/src/products/products.service.spec.ts`
- **Testes/validações executadas:** **12 casos** cobrindo `parseImportPrice` dentro da suíte backend **260/260** desta sessão; lint e build limpos. Helper reverificado por leitura direta por este agente.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas / decisões registradas (são decisões, não detalhes):**
  1. **`"1.234"` continua sendo lido como 1.234, não 1234.** É ambíguo (milhar ou decimal) e mudar isso **multiplicaria preço por mil silenciosamente**. Preservado o comportamento existente, que é o lado seguro do erro. Rever só com decisão explícita do usuário.
  2. **Gap real introduzido pela primeira versão desta própria correção e fechado antes do fim:** o parser aceitava `"12,,50"` como **1250**. Não era fixture ruim — a regra "várias vírgulas = separador de milhar" não validava o **agrupamento**. Passou a exigir `^-?\d{1,3}([.,]\d{3})+$` antes de remover separador. Regex ancorada nas duas pontas, sem quantificador aninhado — **linear, sem ReDoS**.
  3. **Dados já importados antes do fix podem estar faltando produtos — não auditado.** Nenhum backfill foi feito.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0026 — `overrides` de `multer`/`express`/`body-parser` na raiz + bump e dedup de `typeorm`: advisories HIGH alcançáveis eliminados sem trocar de major
- **Problema relacionado:** PROB-0071 (FECHADO), PROB-0068
- **Data:** 2026-07-22
- **Área:** segurança / infra
- **Sintoma:** `multer@2.0.2` com advisory HIGH afetando `<=2.1.1`, **alcançável** pelo `FileInterceptor` de `POST /produtos/importacao`; junto dele, advisories de `express`/`qs`/`path-to-regexp`/`body-parser` na mesma árvore de runtime.
- **Causa raiz:** confirmada — `@nestjs/platform-express@10.4.22` fixa `multer`, `express` e `body-parser` em **versões exatas**, então patch só chega por `overrides`.
- **Correção aplicada:** bloco `overrides` (`multer: ^2.2.0`, `express: ^4.22.2`, `body-parser: ^1.20.6`) no `package.json` **da raiz** — o npm só honra overrides na raiz em workspaces (verificado em teste isolado) — acompanhado de um bloco `comments.overrides` no mesmo arquivo, documentando o motivo de cada um e **a condição de remoção** (migração para NestJS 11). `typeorm` bumpado para `^0.3.31` em `backend/package.json`.
- **Arquivos alterados:** `package.json` (raiz — `overrides` + `comments`), `package-lock.json` (raiz), `backend/package.json`
- **Testes/validações executadas:** suíte completa verde nos três workspaces (shared **8/8**, backend **260/260**, frontend **29/29**), lint e build limpos. `npm audit --omit=dev --workspace=backend`: **20 → 13** (critical 0, high 6, moderate 7). Versões efetivas confirmadas por `npm ls` e reconferidas em disco por este agente: `multer@2.2.0`, `express@4.22.2`, `body-parser@1.20.6`, `qs@6.15.3`, `path-to-regexp@0.1.13`, `typeorm@0.3.31` (cópia única). **Verificação funcional além do build:** teste temporário com Nest + supertest subindo um `FileInterceptor` real — upload multipart chegou com buffer íntegro e arquivo de 6 MB recebeu **413**.
- **Resultado:** PASS_COM_RESSALVA
- **Ressalvas / ARMADILHAS que vão morder de novo:**
  1. **`npm install` NÃO aplica os overrides.** O lockfile já tinha a árvore materializada e o npm 10.9.8 não re-resolve. **Editar o lock na mão removeu `express`/`multer`/`body-parser` da árvore** — a aplicação não subiria. O que funcionou: `npm update multer express body-parser typeorm path-to-regexp`, que re-resolve só o alvo sem regenerar o lock inteiro. **Deletar o `package-lock.json` foi descartado de propósito** (re-resolveria todos os `^` do expo/react-native).
  2. **`body-parser` precisou de override próprio.** `platform-express@10.4.22` depende dele **direto e em versão exata** (`1.20.4`); o override de `express` **não alcança**.
  3. **O bump de `typeorm` criou duas cópias em disco** (`node_modules/typeorm@0.3.28` pelo peer do `@nestjs/typeorm` + `backend/node_modules/typeorm@0.3.31`). **Duas instâncias de TypeORM no mesmo processo duplicam o metadata storage e quebrariam em produção.** `npm update typeorm` deduplicou; estado atual reconferido (uma única cópia, `backend/node_modules/typeorm` não existe mais). **Conferir cópia única após qualquer `npm install` futuro** — BACKLOG-0044.
  4. **O teste que provou o multer funcionando sob platform-express 10 foi removido — não está no diff.** Candidato a guarda permanente: BACKLOG-0043.
  5. Os `overrides` forçam versão em **toda** a árvore, inclusive fora do backend; a suíte verde reduz, mas não elimina, o risco de regressão em pacote sem cobertura.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.

### BUG-0027 — Teste de regressão de PROB-0062 reescrito: `require('fs')` inline quebrava o lint; virou teste comportamental de DTO
- **Problema relacionado:** PROB-0062, BUG-0022
- **Data:** 2026-07-22
- **Área:** backend / qualidade
- **Sintoma:** **problema introduzido pelo próprio trabalho desta sessão.** A guarda de regressão escrita em `backend/src/orders/orders.service.spec.ts` (para impedir que `status` voltasse ao DTO de pedido) lia o arquivo do DTO com `require('fs')` inline — isso quebrava `npm run lint --workspace=backend` com **2 erros `@typescript-eslint/no-var-requires`**.
- **Causa raiz:** confirmada — teste baseado em **inspeção textual do fonte**, o que além de violar a regra de lint é frágil: passaria a falhar por qualquer reformatação e não valida comportamento nenhum.
- **Correção aplicada:** substituído por teste **comportamental**, que é estritamente melhor: valida `CreateOrderDto`/`UpdateOrderDto` com `plainToInstance` + `validate` usando **o mesmo par de opções do `ValidationPipe` global** (`whitelist: true, forbidNonWhitelisted: true`) e assere que `status` aparece entre as propriedades rejeitadas. Passou de **1 teste frágil para 3** (corpo válido aceito, `status` rejeitado no create, `status` rejeitado no update).
- **Arquivos alterados:** `backend/src/orders/orders.service.spec.ts` (`:3` `import 'reflect-metadata'`, `:236` opções do pipe, `:250`/`:255`/`:262` os três casos)
- **Testes/validações executadas:** lint backend **limpo** (era o sintoma); suíte backend **260/260**. Estado final reverificado por leitura direta por este agente.
- **Resultado:** PASS
- **Ressalvas — duas armadilhas que afetam QUALQUER teste futuro de DTO neste repo:**
  1. É preciso `import 'reflect-metadata';` **antes** dos imports de DTO no spec. Sem isso os decorators não registram metadata e a validação vira ruído (`Reflect.getMetadata is not a function` / 23 erros espúrios).
  2. A constante `orderUuid` usada no resto do spec (`bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`) **não é um UUID v4 válido** e não passa em `@IsUUID('4')` — falta o nibble de versão. Qualquer teste novo que valide DTO com uuid precisa de um v4 de verdade.
- **Commit:** `f85809f` — "fix: bloqueadores da revisao do fluxo comercial + restauracao de invariantes" (2026-07-22 15:56, autor Allan Carvalho). **Correção de fato feita por este agente:** a orientação recebida para este registro dizia "nada foi commitado, manter `Commit: pendente`", mas `git show --stat f85809f` mostra as 22 alterações desta sessão (código + docs do primeiro passe) **já commitadas em `master`** — o handoff estava desatualizado. Verificado por este agente; nenhum commit foi feito por ele.
