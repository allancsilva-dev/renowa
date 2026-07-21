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
