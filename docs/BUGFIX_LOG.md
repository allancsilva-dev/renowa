# BUGFIX_LOG — Renowa

> Correções aplicadas, com evidência do comando que as provou. Complementa o
> `PROBLEM_LEDGER.md`, que registra problemas **em aberto**: quando um PROB é
> fechado, a correção entra aqui e o ledger guarda o histórico do diagnóstico.
>
> Entrada sem evidência de comando executado não entra.

## Formato de entrada

```
### FIX-NNNN — <o que foi corrigido>
- **Data:** YYYY-MM-DD
- **Fecha:** PROB-NNNN / BACKLOG-NNNN
- **Área:** backend | frontend | banco | segurança | LGPD | infra | documentação
- **Sintoma:** o que o usuário ou o operador via
- **Correção:** o que mudou, e por quê essa e não outra
- **Arquivos:** `caminho` (sem número de linha — envelhece mal)
- **Evidência:** comando executado e resultado
- **Efeito observável:** o que muda para quem usa ou opera
- **Ressalvas:** o que a correção NÃO cobre
```

---

## Correções

### FIX-0001 — `db:migrate` destravado em todo banco provisionado antes de `0f066ae`
- **Data:** 2026-07-29
- **Fecha:** PROB-0072
- **Área:** banco / infra
- **Sintoma:** `npm run db:migrate --workspace=backend` abortava com `Migration já aplicada foi alterada: 0007_optimistic_concurrency.sql`. Nenhuma migration nova era aplicável — o banco de dev estava parado em `0032` e as features de 2026-07-29 nunca tinham sido exercitadas contra o schema real. Por inferência, produção estava no mesmo estado.
- **Correção:** allowlist `CHECKSUMS_SUPERSEDIDOS` em `migrate.ts`, aceitando o checksum antigo de `0007` — a diferença entre as duas versões do arquivo é só controle de transação, nenhum DDL. A versão antiga ficou preservada como fixture versionada em `migrations/.superseded/`, e **não** como `git show` dentro do teste: o CI usa `actions/checkout@v4` com `fetch-depth` padrão (clone raso) e `git show <sha>:<path>` não resolve no runner. Descartados: `UPDATE` manual em `schema_migrations` (não versionado, deixaria produção travada) e recriar o banco de dev (não resolve banco com dados).
- **Arquivos:** `backend/src/database/migrate.ts`, `backend/src/database/migrations/.superseded/0007_optimistic_concurrency.f5d5654c.sql`, `backend/src/database/migrations-hygiene.spec.ts`
- **Evidência:** `npm test --workspace=backend -- migrations-hygiene` → 36 passed. `DATABASE_URL=…/renowa npm run db:migrate` → aplicou `0033`, `0034`, `0035` e depois `0036`, `0037`. `SELECT count(*), max(name) FROM public.schema_migrations` saiu de `19 | 0032_produto_ipi_perc.sql` para `24 | 0037_lgpd_purga_e_totais_externos.sql`.
- **Efeito observável:** o banco de dev migra e `db:verify` passa limpo. BACKLOG-0049 (validação ponta a ponta pela UI) fica desbloqueado.
- **Ressalvas:** afrouxa, por definição, a única proteção contra migration editada depois de aplicada. Quatro casos de teste limitam o dano: todo hash aceito precisa de fixture que o produza, a fixture só pode diferir do arquivo atual em linhas de controle de transação, nenhuma fixture fica órfã e o runner segue sem enxergar `.superseded/`. **Produção não foi verificada** — o `db:migrate` lá ainda não rodou.

### FIX-0002 — Drift de sync no banco de dev: `0008`/`0009` aplicadas, objetos ausentes
- **Data:** 2026-07-29
- **Fecha:** achado colateral de PROB-0072 (não tinha ID próprio)
- **Área:** banco
- **Sintoma:** com o `db:migrate` destravado, `db:verify` reprovou o banco de dev com cinco objetos faltando: `sync_outbox`, `sync_changes`, `sync_mutation_inbox`, `capture_sync_outbox()` e `drain_sync_outbox()`. As duas migrations que os criam constavam aplicadas em `schema_migrations`. É a assinatura de PROB-0059, já prevista no comentário de `0031_restore_schema_invariants.sql`.
- **Correção:** `0008_sync_change_feed.sql` e `0009_sync_push_v2.sql` reaplicadas via `psql` no banco de dev, por decisão do usuário, sem tocar em `schema_migrations`. Seguro porque as duas são integralmente idempotentes — só `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` e `CREATE OR REPLACE FUNCTION`, conferido antes de rodar.
- **Arquivos:** nenhum (operação de banco)
- **Evidência:** `db:verify` antes → `DRIFT: 5 problema(s)` (`3x tabela`, `2x funcao`). Depois → `OK: schema íntegro. Nenhum drift encontrado.` Os seis triggers `trg_*_sync_outbox` conferidos em `pg_trigger`.
- **Efeito observável:** o change feed de sync volta a funcionar no dev. Efeito lateral relevante: com `sync_outbox` de volta, a varredura de `UNIQUE(tenant_id, id)` passou a acusar **dez** tabelas, não as nove que a auditoria levantara — a lista original tinha sido tirada de um banco com esse mesmo drift.
- **Ressalvas:** **produção pode ter o mesmo drift e não foi verificada.** Rodar `db:verify` lá.

### FIX-0003 — Push de sync escrevia em pedido de origem externa sem guarda
- **Data:** 2026-07-29
- **Fecha:** PROB-0074
- **Área:** backend / segurança
- **Sintoma:** um device podia sobrescrever `status`, `total_sem_imposto` e `total_com_imposto` de pedido **externo** pelo push, sem nenhuma das guardas do caminho HTTP: rompia a igualdade dos totais que a fila de faturamento lê, gravava `status` sem a permissão `pedidos.liberar` e sem máquina de estados, e a violação do CHECK vazava como `23514` cru em vez de 400 semântico.
- **Correção:** `SyncEntityPolicy` ganhou `writableFieldsFor`, que deriva a allowlist da linha corrente — sem TOCTOU, porque `origem` é escrita na criação e nunca atualizada. A validação ficou em **duas passadas**: a base antes do SELECT (campo desconhecido ou controlado pelo servidor morre sem tocar no banco) e a dependente da linha depois. `assertOrigemEditavel` recusa UPDATE de pedido externo fora de `em_aberto`, em paridade com `updateExternal`. `serverControlledFields`, que era declarativo, passou a ser lido em runtime com mensagem própria.
- **Arquivos:** `backend/src/sync/sync-entity-policy.ts`, `backend/src/sync/sync.service.ts`, `backend/src/sync/sync.service.spec.ts`
- **Evidência:** `npm test --workspace=backend -- sync` → 79 passed, com 9 casos novos cobrindo v1 e v2.
- **Efeito observável:** **mudança de contrato.** O push passa a rejeitar o que aceitava em silêncio; no v2 vira `status: 'rejected'`, `code: 'VALIDATION_FAILED'`, `retryable: false`.
- **Ressalvas:** `mobile/` não foi alterado nem validado, por escopo. PROB-0065 segue aberto de propósito — `status` continua gravável em pedido **interno**, com teste fixando isso para que fechá-lo seja decisão explícita.

### FIX-0004 — ERASURE não alcançava fotos do pedido nem tabelas de SAC
- **Data:** 2026-07-29
- **Fecha:** PROB-0075
- **Área:** LGPD / backend
- **Sintoma:** depois de um apagamento **concluído com sucesso**, o binário das fotos seguia íntegro em `pedido_fotos.conteudo` e servível pelo endpoint de conteúdo — uma foto de nota fiscal traz nome, CNPJ e endereço no próprio pixel. `chamados_sac.observacao`, `chamados_sac.numero_nfe` e `itens_chamado_sac.motivo` também sobreviviam. Pior: a migration `0034` afirmava por escrito o contrário.
- **Correção:** o ERASURE passou a ser **gerado** a partir de `pii-registry.ts`, que declara por tabela o vínculo até o titular e a estratégia por coluna. Migration `0037` abriu `storage_backend = 'purgado'` e o ramo correspondente do CHECK — sem ele, zerar `conteudo` viola a constraint. `itens_chamado_sac.motivo` recebe literal, nunca NULL: a coluna é `NOT NULL` e NULL abortaria o apagamento inteiro com `23502`. Entraram também `inadimplencia.observacao` e `notas_fiscais.observacao`, que a auditoria não listara e têm a mesma natureza de `pedidos.observacao`.
- **Arquivos:** `backend/src/privacy/pii-registry.ts`, `backend/src/privacy/privacy.service.ts`, `backend/src/database/migrations/0037_lgpd_purga_e_totais_externos.sql`, `backend/src/privacy/privacy.service.spec.ts`, `backend/src/privacy/pii-registry.spec.ts`, `docs/LGPD_ARCHITECTURE.md`
- **Evidência:** `npm test --workspace=backend` → 500 passed. Smoke contra PostgreSQL real (`renowa_fix`, migrado até `0037`): cliente + pedido + foto (`bytea`) + nota + inadimplência + chamado + item semeados, SQL gerado executado e sete provas em SQL — nenhum CHECK nem `NOT NULL` violado, transação revertida ao final.
- **Efeito observável:** o apagamento alcança o binário das fotos e as tabelas de SAC. Tabela nova com `tenant_id` que não for classificada **quebra a build**.
- **Ressalvas:** `0034` **não** foi editada de propósito — já está aplicada, e reescrevê-la mudaria seu checksum, re-disparando PROB-0072. A correção da frase falsa foi para o relatório de implementação e para `LGPD_ARCHITECTURE.md`. `parceiros_comerciais.nome_parceiro` continua sem caminho de apagamento (PROB-0076), e não há política de retenção.

### FIX-0005 — Soft delete não descia para fotos do pedido nem itens de SAC
- **Data:** 2026-07-29
- **Fecha:** BACKLOG-0055
- **Área:** backend / banco
- **Sintoma:** excluído o pedido, `pedido_fotos` ficava com `deleted_at IS NULL`; idem `itens_chamado_sac` ao excluir o chamado. As FKs são `NO ACTION`, então os filhos só sumiam da tela porque cada query lembra de filtrar — a primeira que esquecesse ressuscitaria dado de registro excluído.
- **Correção:** os dois `remove` passaram a rodar em `dataSource.transaction`, com `manager.getRepository(...)` no `optimisticSoftDelete` e um `UPDATE` de cascata logo em seguida, filtrando `deleted_at IS NULL` para não re-marcar filho já apagado e inflar `version`. A cascata vem depois do pai: conflito de `version` aborta tudo.
- **Arquivos:** `backend/src/orders/orders.service.ts`, `backend/src/sac/sac.service.ts`, specs correspondentes
- **Evidência:** `npm test --workspace=backend -- orders sac` → 83 passed, com casos para cascata, rollback em conflito de `version` e bloqueio por nota fiscal ativa sem marcar fotos.
- **Efeito observável:** filhos somem junto com o pai, por dado e não por convenção de query.
- **Ressalvas:** fecha também, de graça, o TOCTOU entre `countNotasAtivas` e o soft delete do pedido — antes fora de transação. Fotos migradas para bucket no futuro continuarão precisando de expurgo do objeto remoto (BACKLOG-0051).

### FIX-0006 — 409 sem mensagem útil e timeout único para downloads binários
- **Data:** 2026-07-29
- **Fecha:** BACKLOG-0056
- **Área:** frontend
- **Sintoma:** "Pedido já liberado" e "limite de 10 fotos atingido" chegavam ao usuário como *"Recurso em uso — não pode ser removido"* — mensagem que descrevia outra coisa, exibida direto no painel de fotos. E o download de fotos herdava o timeout de 10 s do JSON, com thumbs e PDF baixando até 10 imagens em `Promise.all` na mesma janela.
- **Correção:** 409 passou a usar `backendMessage` quando existe, como 400/403 já faziam. `ApiRequestOptions` ganhou `timeoutMs`, e `requestBlob` usa 30 s por padrão.
- **Arquivos:** `frontend/src/lib/errors.ts`, `frontend/src/lib/errors.test.ts`, `frontend/src/lib/apiClient.ts`
- **Evidência:** `npm test --workspace=frontend` → 58 passed.
- **Efeito observável:** o usuário lê a razão real do conflito. Download de fotos sobrevive a rede lenta.
- **Ressalvas:** `errors.test.ts` **já existia** e continha um caso que fixava o comportamento antigo (`'mantém os textos fixos de 422/404/409'`) — o teste protegia o defeito. Foi editado, não criado.

### FIX-0007 — Paridade de cálculo do SAC virou mecanismo, e o CI passou a rodar as suítes que ignorava
- **Data:** 2026-07-29
- **Fecha:** BACKLOG-0057
- **Área:** backend / frontend / shared / infra
- **Sintoma:** o comentário do teste do frontend afirmava que os casos eram os mesmos do backend. Não eram — duas listas escritas à mão, cada uma cobrindo bordas que a outra ignorava. Uma divergência de arredondamento passaria pelas duas suítes verdes e só apareceria como total da tela diferente do total do papel impresso.
- **Correção:** fixture única em `shared/src/sac/calculation-cases.ts`, dado puro, iterada por Jest no backend e Vitest no frontend. O backend passou a coalescer `''` para 0 — `?? 0` não cobre string vazia e `new Decimal('')` lança, o que derrubaria o servidor com 500 num import de CSV ou migração que chamasse o service direto.
- **Arquivos:** `shared/src/sac/calculation-cases.ts`, `shared/src/index.ts`, `backend/src/sac/sac-calculation.ts`, `backend/src/sac/sac-calculation.spec.ts`, `frontend/src/lib/sacCalculation.test.ts`, `.github/workflows/ci.yml`, `AGENTS.md`
- **Evidência:** `npm test --workspace=backend -- sac-calculation` → 22 passed; `npm test --workspace=shared` → 9 passed; `npm test --workspace=frontend` → 58 passed.
- **Efeito observável:** caso novo entra uma vez e vale para os dois lados; divergência quebra um deles.
- **Ressalvas:** o critério de aceite exigia que a divergência quebrasse o build, e **não quebrava** — o `ci.yml` rodava apenas `npm test --workspace=backend`. Sem acrescentar `shared` e `frontend` ao pipeline, a fixture seria teatro. `AGENTS.md` também passou a listá-los: antes citava só lint e build do frontend, espelhando a mesma lacuna.

---

> **FIX-0008 a FIX-0019 — rodada de reverificação independente das três frentes (2026-07-29, parte 3).**
> Gatilho: "verifique se está bom" depois de implementação, auditoria e fechamento de
> pendências já commitados. Relatório:
> [REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md](REVIEW_REPORTS/2026-07-29_review_reverificacao-fotos-pedido-externo-sac.md).
> Verificação comum a todas as entradas abaixo, executada ao fim da rodada:
> `lint`/`build` do backend e do frontend limpos; backend **517 passed** (era 500, 50 suites,
> 1 skipped); shared **9**; frontend **60** em 11 arquivos (era 58 em 10). Banco descartável
> `renowa_verify38` provisionado do zero: `db:migrate` aplicou `0000…0038` sem erro,
> `db:verify` OK (28/28 tabelas, 34/34 CHECKs, 7/7 índices parciais, 22/22 triggers, 0 FK sem
> isolamento, 0 tabela sem `UNIQUE(tenant_id,id)` + 1 isenta) e o banco foi **descartado**.
> Banco de dev `renowa` saiu de `0037` para **`0038`** com `db:verify` limpo.
> **Nada desta rodada foi commitado.**

### FIX-0008 — Miniaturas de foto em laço infinito de requisições quando o download falha
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio (encontrado e corrigido na mesma sessão)
- **Área:** frontend
- **Sintoma:** foto cujo download falha — 404 de foto purgada pela LGPD, timeout, rede ruim — fazia o painel refazer a requisição **indefinidamente**, uma por render. No caminho felizes não aparece: a foto que baixa sai dos pendentes e o laço converge. Agravante: `GET /pedidos/:uuid/fotos/:fotoUuid/conteudo` **não tem `@Throttle`** (`order-photos.controller.ts:51`; o `@Throttle` da linha 26 é do upload), então uma aba aberta com uma foto quebrada martela o endpoint que serve binário.
- **Causa raiz:** confirmada. `thumbs` estava nas dependências do efeito e os pendentes eram derivados dele; `setThumbs` sempre devolve um objeto novo, então cada rodada re-renderizava e re-disparava o efeito, e a foto que falha nunca deixa de ser pendente.
- **Correção:** `useRef<Set<string>>` com os uuids já buscados **com ou sem sucesso**, fora do ciclo de render, mais um `thumbsRef` espelhando `thumbs` para que uma **recarga explícita** possa retentar o que falhou sem refazer o download do que já está em cache. `thumbs` saiu das dependências.
- **Arquivos:** `frontend/src/components/orders/OrderPhotosPanel.tsx`, `frontend/src/components/orders/OrderPhotosPanel.test.tsx` (novo)
- **Evidência:** teste escrito **antes** do fix, contando as chamadas ao serviço com o download falhando e deixando o event loop girar 5 voltas: **32 requisições** sem o fix, **1** com o fix. `npm test --workspace=frontend` → 60 passed em 11 arquivos.
- **Efeito observável:** foto quebrada mostra o espaço vazio e para; deixa de gerar tráfego contínuo.
- **Ressalvas:** o endpoint de conteúdo continua **sem `@Throttle`** — o laço foi fechado no cliente, não no servidor. Um cliente hostil (ou outra tela com o mesmo padrão) ainda pode martelá-lo. É o primeiro teste de tela das três frentes; as demais seguem sem cobertura (BACKLOG-0061).

### FIX-0009 — Colisão de uuid gerado no cliente virava 500 em vez de 409
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend
- **Sintoma:** duplo clique em "Salvar" ou retry de rede reenvia o **mesmo uuid** — o uuid é gerado no cliente. `SacService.create` e `OrdersService.create`/`createExternal` não tinham a guarda que o `update` já tinha: o INSERT morria no índice único, `23505` subia cru e o usuário recebia **500**, erro de banco vazando como falha do servidor.
- **Correção:** dois níveis, de propósito. (a) Rede de segurança no `GlobalExceptionFilter`, mapeando `unique_violation` para **409 `CONFLICT`** com mensagem genérica — nome de constraint e valores ficam no log, não na resposta. Detectado por **forma** (`driverError.code` ou `code` === `'23505'`) e não por `instanceof QueryFailedError`: o mesmo erro chega embrulhado ou cru dependendo de quem executou a query (repositório, manager ou `query` direto), e a forma sobrevive a troca de versão do TypeORM. (b) Guardas de aplicação `assertUuidLivre` (pedidos) e `assertUuidsLivres` (SAC — chamado e itens, os itens em **uma** query em lote), que dão a mensagem de negócio. As guardas não distinguem uuid de outro tenant de propósito: a resposta é a mesma nos dois casos, para não revelar existência cross-tenant.
- **Arquivos:** `backend/src/common/filters/global-exception.filter.ts`, `backend/src/common/filters/global-exception.filter.spec.ts`, `backend/src/orders/orders.service.ts`, `backend/src/orders/orders.service.spec.ts`, `backend/src/sac/sac.service.ts`, `backend/src/sac/sac.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 517 passed, com casos novos no filtro (erro embrulhado e erro cru) e nas guardas de pedido e de SAC.
- **Efeito observável:** **mudança de contrato** — colisão de uuid responde 409 com mensagem de negócio; qualquer `unique_violation` que escape de guarda responde 409 genérico.
- **Ressalvas:** o mapeamento no filtro vale para **todo** o backend. Consequência: violação de unicidade que hoje seria bug real de aplicação passa a sair como 409 de negócio em vez de 500 ruidoso — o log guarda mensagem original e stack, mas o sinal fica mais quieto. As guardas existem justamente para que o filtro seja rede de segurança, não caminho normal.

### FIX-0010 — Chamado SAC nascia com `version = 2`
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend
- **Sintoma:** todo chamado recém-criado tinha `version = 2` no primeiro carregamento, embaralhando o controle de concorrência otimista desde o início.
- **Causa raiz:** confirmada. `SacService.create` salvava o cabeçalho **duas vezes**: uma para obter o `id` a usar na FK dos itens, outra para gravar o total depois de construí-los.
- **Correção:** itens calculados **antes** do primeiro `save`, com o total já no `create`. `buildItem` passou a aceitar `chamado_id: number | null` — ele só precisa do `id` para a FK, e o total depende apenas dos valores calculados, então é conhecível antes de o cabeçalho existir.
- **Arquivos:** `backend/src/sac/sac.service.ts`, `backend/src/sac/sac.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 517 passed, com caso fixando `version = 1` no chamado recém-criado.
- **Efeito observável:** chamado novo nasce com `version = 1`, como pedido e as demais entidades.
- **Ressalvas:** chamados já criados seguem com `version = 2`. Não há correção retroativa e não é necessária: `version` só importa como comparação, não como valor absoluto.

### FIX-0011 — Teto de 10 fotos por pedido era furável por concorrência
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend
- **Sintoma:** duas abas (ou dois cliques) enviando fotos ao mesmo tempo passavam pela **mesma** contagem antes de qualquer uma gravar, e as duas gravavam — pedido acima do teto de 10.
- **Causa raiz:** confirmada. A contagem rodava **fora** da transação da gravação. TOCTOU clássico.
- **Correção:** contar e gravar na **mesma** transação, com `SELECT id FROM pedidos WHERE id = $1 FOR UPDATE` antes da contagem. O lock é na linha do **pedido**, não em `pedido_fotos`, então serializa apenas os uploads do mesmo pedido, sem afetar pedidos diferentes. Não existe CHECK possível para "no máximo 10 filhos" — o lock é a única trava disponível no banco.
- **Arquivos:** `backend/src/orders/order-photos.service.ts`, `backend/src/orders/order-photos.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 517 passed, com o teste do teto reescrito contra o `manager` da transação. A serialização em si **não** foi provada contra PostgreSQL real (a suíte é mock puro — BACKLOG-0028).
- **Efeito observável:** o teto passa a valer também sob upload concorrente.
- **Ressalvas:** a prova do lock depende de teste de integração que não existe. O upload pela UI já era sequencial de propósito; a correção cobre o caso de dois clientes.

### FIX-0012 — Pedido externo duplicado era aceito sem nenhuma trava
- **Data:** 2026-07-29
- **Fecha:** decisão 3 do usuário nesta rodada
- **Área:** backend / banco
- **Sintoma:** o mesmo pedido do sistema de terceiro podia ser registrado N vezes. Cada registro consome um `numero_pedido` novo e gera **fila de faturamento e comissão duplicadas** — é o erro de digitação mais provável da feature.
- **Correção:** índice único parcial `uq_pedidos_externo_numero (tenant_id, fornecedor_id, numero_pedido_externo) WHERE origem = 'externo' AND deleted_at IS NULL` (migration `0038`) mais a guarda `assertNumeroExternoLivre` em `createExternal`/`updateExternal`, que responde **409 citando o pedido que já usa o número** e ignora o próprio pedido no update. A guarda dá a mensagem de negócio, o índice garante sob concorrência. A chave é **(tenant, fornecedor, número)** e **não** (tenant, sistema, número): `sistema_origem` é texto livre digitado ("SAP B1" / "SapB1" / "sap b1") e como chave deixaria passar exatamente a duplicata que se quer barrar; o mesmo número em fornecedores distintos é legítimo. Índice **parcial** nos dois predicados: `origem` porque pedido interno tem o número NULL por CHECK (`0033`) e NULLs não colidem — mas o predicado deixa a intenção explícita; `deleted_at IS NULL` porque pedido excluído não deve reservar o número para sempre, já que corrigir lançamento errado é excluir e refazer. Mesmo padrão de `uq_chamados_sac_tenant_numero_active` (`0035`).
- **Arquivos:** `backend/src/database/migrations/0038_pedido_externo_unico_e_sac_por_tenant.sql`, `backend/src/orders/orders.service.ts`, `backend/src/orders/orders.service.spec.ts`, `backend/src/database/verify-schema.ts`
- **Evidência:** smoke SQL em `renowa_verify38` contra PostgreSQL real: (1) primeiro externo entra; (2) mesmo número no mesmo fornecedor **recusado** pelo índice; (3) mesmo número em outro fornecedor entra; (4) soft delete **libera** o número. `npm test --workspace=backend` → 517 passed. `db:verify` reconhece o índice novo (7/7 índices parciais).
- **Efeito observável:** **mudança de contrato** — duplicata responde 409 em vez de criar segundo pedido.
- **Ressalvas:** **esta é a única mudança da rodada capaz de abortar uma migration em ambiente com dados.** Se houver duplicata pré-existente, o `CREATE UNIQUE INDEX` falha e a migration para — comportamento desejado, porque a resolução é decisão de negócio. Pré-check obrigatório em BACKLOG-0062. No dev não houve risco: **0 pedido externo**.

### FIX-0013 — Numeração de SAC vinha de sequence global e revelava o volume de outros tenants
- **Data:** 2026-07-29
- **Fecha:** decisão 2 do usuário nesta rodada
- **Área:** backend / banco
- **Sintoma:** `sac_numero_seq` é sequence **global**. O tenant A enxergava #1, #4, #9 — os buracos revelavam quantos chamados os outros tenants abriram no intervalo.
- **Correção:** tabela `sac_numero_contador (tenant_id PK, ultimo, updated_at)` com CHECK `ultimo >= 0`, trigger `set_updated_at` e backfill do `MAX(numero_chamado)` por tenant (**inclusive soft-deleted** — número de chamado excluído não volta a circular). `SacService.proximoNumero` emite com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`: **uma** instrução atômica que trava apenas a linha do próprio tenant, então dois tenants nunca se serializam entre si. Descartados: sequence por tenant (exigiria DDL dinâmico a cada tenant novo) e `MAX+1` (corrida clássica). `tenant_id` como PRIMARY KEY já satisfaz o invariante `UNIQUE(tenant_id, id)` do `db:verify [6/6]` — é um contador, não tem identidade além do tenant, e por isso não tem `id` nem soft delete.
- **Arquivos:** `backend/src/database/migrations/0038_pedido_externo_unico_e_sac_por_tenant.sql`, `backend/src/sac/sac.service.ts`, `backend/src/sac/sac.service.spec.ts`, `backend/src/database/verify-schema.ts`
- **Evidência:** smoke SQL em `renowa_verify38`: contador dá `tenantA=1`, `tenantA=2`, `tenantB=1` — numeração por tenant provada; `ultimo = -1` recusado pelo CHECK. Concorrência: **50 emissões paralelas** (`xargs -P 10`) do mesmo tenant → **50 números distintos, nenhum erro, nenhum deadlock**. `npm test --workspace=backend` → 517 passed.
- **Efeito observável:** **mudança de contrato** — chamados **novos** seguem 1, 2, 3 por tenant.
- **Ressalvas:** **chamados existentes não são renumerados** — número já emitido pode estar impresso no papel do chamado, e reescrever histórico para fechar buraco é pior que o buraco. O buraco por **rollback** continua existindo, exatamente como no pedido: o número é consumido antes do COMMIT. `sac_numero_seq` fica no banco **sem uso** — dropar sequence é irreversível, não traz benefício, e mantê-la deixa `db:migrate` reaplicável em banco que já passou pela `0035`.

### FIX-0014 — Filtro com valor fora do enum devolvia 200 com lista vazia
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend
- **Sintoma:** `GET /pedidos?status=`/`?origem=` e `GET /sac?status=` com valor inválido respondiam **200 com lista vazia** — indistinguível de "não há registros". O operador conclui que não existe pedido quando o erro está no valor, e um front com typo falha em silêncio.
- **Correção:** validação contra o enum antes de montar o `WHERE`, com **400** listando os valores aceitos. Constantes novas `ORDER_ORIGENS` e `ORDER_STATUSES` em `order.entity.ts`, espelhando `pedidos_origem_check` (`0033`) e `pedidos_status_check` (`0027`) com a origem anotada no comentário; o SAC reusa o `SAC_STATUSES` que já existia e que `updateStatus` já usava.
- **Arquivos:** `backend/src/orders/entities/order.entity.ts`, `backend/src/orders/orders.service.ts`, `backend/src/orders/orders.service.spec.ts`, `backend/src/sac/sac.service.ts`, `backend/src/sac/sac.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 517 passed, com casos para status inválido e origem inválida nos dois módulos.
- **Efeito observável:** **mudança de contrato** — filtro inválido responde 400.
- **Ressalvas:** as constantes duplicam em TypeScript o que os CHECKs declaram no banco; nada força a sincronia além do comentário apontando a migration de origem. Um valor novo de status exige tocar os dois lugares.

### FIX-0015 — `data` do chamado SAC aceitava datetime e podia gravar outro dia
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend
- **Sintoma:** a coluna é `date`, mas `@IsDateString` sozinho aceita `2026-07-29T12:00:00Z`. O Postgres trunca a hora convertendo por fuso — dependendo do horário informado, o **dia gravado sai diferente do informado**.
- **Correção:** `@Matches(/^\d{4}-\d{2}-\d{2}$/)` somado ao `@IsDateString`, com mensagem própria. Aplicado **só no DTO de SAC**, que não trafega no sync.
- **Arquivos:** `backend/src/sac/dto/create-sac-ticket.dto.ts`, `backend/src/sac/sac.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 517 passed.
- **Efeito observável:** **mudança de contrato** no `POST`/`PUT` de SAC: datetime passa a ser 400.
- **Ressalvas:** o DTO de **pedido** segue com `@IsDateString` puro **de propósito** — apertar lá muda o contrato do sync, que tem contraparte no cliente mobile. Registrado em BACKLOG-0060.

### FIX-0016 — N+1 sob lock pessimista em `SacService.update`
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend
- **Sintoma:** a guarda contra sequestro de uuid de item fazia **um SELECT por item**, dentro da transação que já mantém `pessimistic_write` no chamado: 50 itens viravam 50 idas ao banco com o lock aberto, bloqueando qualquer outra escrita naquele chamado por todo o tempo.
- **Correção:** uma query em lote — `SELECT uuid FROM itens_chamado_sac WHERE uuid = ANY($1) AND (tenant_id <> $2 OR chamado_id <> $3) LIMIT 1`. A condição de invasão foi movida para o `WHERE`, em vez de trazer as linhas e comparar em TypeScript.
- **Arquivos:** `backend/src/sac/sac.service.ts`, `backend/src/sac/sac.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 517 passed, com o caso de uuid de outro chamado preservado.
- **Efeito observável:** nenhuma mudança de comportamento — mesma recusa (`400`), menos tempo com o lock aberto.
- **Ressalvas:** a mensagem de erro passou a se referir ao **primeiro** invasor encontrado (`LIMIT 1`), onde antes se referia ao item da iteração corrente. Com mais de um uuid invasor no mesmo lote, o usuário vê um por vez.

### FIX-0017 — Formulários sem guarda de permissão na rota, e `/pedidos/externo` caindo em `:uuid`
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** frontend
- **Sintoma:** quem só tinha `pedidos.ver` (ou `sac.ver`) abria `/pedidos/novo`, `/pedidos/externo/novo`, os `editar` e `/sac/novo` — preenchia a tela inteira e descobria a recusa **ao salvar**. Separadamente, `/pedidos/externo` sem sufixo casava com a rota `:uuid` e virava **erro de API** em vez de rota inexistente.
- **Correção:** cada formulário declara no `ProtectedRoute` a permissão que o backend vai exigir no submit — `/sac/novo` → `sac.criar`, `/sac/:uuid/editar` → `sac.editar`, `/pedidos/novo` e `/pedidos/externo/novo` → `pedidos.criar`, os `editar` → `pedidos.editar`. `/pedidos/externo` ganhou rota própria com `<Navigate to='/pedidos' replace />`.
- **Arquivos:** `frontend/src/App.tsx`
- **Evidência:** `npm run lint --workspace=frontend` limpo; `npm run build --workspace=frontend` built; `npm test --workspace=frontend` → 60 passed.
- **Efeito observável:** usuário sem a permissão é barrado **antes** de preencher o formulário. O backend continua sendo a autoridade — isto é conveniência, não segurança.
- **Ressalvas:** não há teste cobrindo as guardas de rota (BACKLOG-0061). As demais rotas do app seguem sem `permission` declarada, dependendo exclusivamente do backend.

### FIX-0018 — Fila de faturamento não distinguia pedido externo
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** backend / frontend
- **Sintoma:** na fila de `/faturamento`, pedido externo e interno eram visualmente idênticos. Em pedido externo o `valor` é **declarado** pelo operador, não somado de itens — o que muda o significado da **divergência** contra a nota, e quem confere não tinha como saber.
- **Correção:** `PedidoFaturamentoRow` passou a expor `origem`, `sistema_origem` e `numero_pedido_externo`; a tela ganhou coluna **Origem**, mostrando o `sistema_origem` quando externo e o número de origem no `title`.
- **Arquivos:** `backend/src/faturamento/faturamento.service.ts`, `backend/src/faturamento/faturamento.service.spec.ts`, `frontend/src/services/faturamento.service.ts`, `frontend/src/pages/Faturamento.tsx`
- **Evidência:** `npm test --workspace=backend` → 517 passed, com casos novos na spec do `FaturamentoService` cobrindo os três campos em pedido interno e externo. `build`/`lint` do frontend limpos.
- **Efeito observável:** **mudança de contrato aditiva** na resposta da fila; coluna nova na tela.
- **Ressalvas:** só rotula. **A comissão gerada continua gravando o `numero_pedido` interno** (`faturamento.service.ts:200`), então não reconcilia com o sistema de origem na tela de financeiro — PROB-0080, aberto.

### FIX-0019 — Papel do SAC sem data de abertura, e aba de PDF em branco durante a montagem
- **Data:** 2026-07-29
- **Fecha:** defeito novo, sem PROB próprio
- **Área:** frontend
- **Sintoma:** (a) o único carimbo temporal do papel do chamado era a data da **impressão**, no rodapé — o documento do atendimento não registrava quando o chamado foi aberto. (b) A aba do PDF (SAC e pedido) ficava **em branco** enquanto o documento montava, o que com fotos leva um download por imagem.
- **Correção:** (a) linha `DATA DE ABERTURA` no `SacTicketPdf`, formatada a partir da string `YYYY-MM-DD` **sem** passar por `new Date()` — `new Date('2026-07-29')` é lido como UTC e viraria dia 28 em qualquer fuso negativo, que é o do Brasil inteiro. (b) A aba recebe um aviso "Gerando…" imediatamente após `window.open`.
- **Arquivos:** `frontend/src/components/sac/SacTicketPdf.tsx`, `frontend/src/pages/SacDetalhe.tsx`, `frontend/src/pages/PedidoDetalhe.tsx`
- **Evidência:** `npm run build --workspace=frontend` built; `npm run lint --workspace=frontend` limpo; `npm test --workspace=frontend` → 60 passed.
- **Efeito observável:** o papel do chamado carrega a data de abertura; a aba explica a espera.
- **Ressalvas:** a aba continua sendo aberta **antes** do `await`, e isso é **deliberado** — depois de um `await` o navegador já não trata a chamada como resposta ao clique e o bloqueador de popup mata a janela. Não é o padrão "abrir depois de pronto" de propósito. O layout do papel do SAC segue duplicando o `StyleSheet` de `OrderValidationPdf` (BACKLOG-0059), então mexer na identidade visual exige mexer nos dois.

### FIX-0020 — Filtros `status` e `origem` nas listas de pedidos e SAC voltaram a funcionar
- **Data:** 2026-07-29
- **Fecha:** PROB-0081
- **Área:** backend
- **Sintoma:** `GET /pedidos?origem=externo`, `?status=faturado` e `GET /sac?status=aberto` devolviam **400** `property origem should not exist`; na tela, escolher o filtro Origem imprimia "Ocorreu um erro". `search` funcionava, o que disfarçava o defeito.
- **Correção:** os filtros passaram a ser campos de DTO — `ListOrdersQueryDto` e `ListSacQueryDto`, ambos `extends PaginationDto`, com `@IsIn` contra `ORDER_STATUSES`, `ORDER_ORIGENS` e `SAC_STATUSES` e mensagem nomeando os valores aceitos. Os `@Query('x')` soltos saíram dos dois controllers, junto do `@Query('search')` que duplicava um campo que já vinha do `PaginationDto`. **Essa e não outra** porque a causa é o `@Query()` sem chave: ele faz o ValidationPipe validar o objeto de query inteiro contra o DTO, e com `forbidNonWhitelisted` todo parâmetro fora dele derruba a requisição — afrouxar o pipe global consertaria o filtro e abriria a porta para gravação de campo não declarado em todo o resto da API. A checagem de enum ficou nos services como defesa em profundidade: o mobile/sync não passa por estes DTOs.
- **Arquivos:** `backend/src/orders/dto/query-orders.dto.ts`, `backend/src/sac/dto/query-sac.dto.ts`, `backend/src/orders/orders.controller.ts`, `backend/src/sac/sac.controller.ts`, `backend/src/common/architecture/query-filter-whitelist.spec.ts`, `backend/src/orders/orders.service.spec.ts`, `backend/src/sac/sac.service.spec.ts`
- **Evidência:** `npm test --workspace=backend` → 553 passed, 1 skipped (51 suítes). Na aba logada do Safari: `origem=externo` → 200 `total=1` com toda linha `origem: "externo"`; `origem=externa` → 400 `Origem inválida. Use um de: interno, externo.`; `status=faturadoo` → 400 `Status inválido. Use um de: em_aberto, liberado, parcialmente_faturado, faturado, cancelado.`; `sac?status=resolvidoo` → 400 com a mensagem do enum; `?xpto=1` → 400 `property xpto should not exist`. Pela tela: `/pedidos` com Origem=externo e `/sac` com Status=aberto listam sem "Ocorreu um erro". Bloco de filtros 9/9.
- **Efeito observável:** os filtros das duas listas funcionam. **Mudança de mensagem de erro:** valor fora do enum agora responde com os valores aceitos em vez de `property x should not exist`.
- **Ressalvas:** a guarda de regressão é a asserção de **mensagem**, não o código 400 — foi o 400 do whitelist que fez os testes "enum inválido" do roteiro passarem por motivo errado e deixarem FIX-0014 sem prova. O spec de arquitetura varre todos os controllers e inclui um caso que prova que ele próprio dispara. **Não corrigido:** `usePaginatedQuery` continua descartando a mensagem da API em favor de "Ocorreu um erro" em todas as listas, que é o que tornou este defeito ilegível na tela.

### FIX-0021 — Código do item transbordava na coluna CÓDIGO do papel
- **Data:** 2026-07-30
- **Fecha:** defeito de layout observado na rodada, sem PROB próprio
- **Área:** frontend
- **Sintoma:** `styles.colCode` tinha **7%** da largura da tabela de itens. Código de item com mais de ~8 caracteres quebrava ou vazava da célula no papel impresso.
- **Correção:** a coluna subiu para **10%** na redistribuição feita para abrir espaço à coluna FOTO. As larguras somam exatamente 100% e a folga saiu das colunas numéricas, que tinham sobra: `colDescription` 18,5→15%, `colTotalSemImp` 12→9,5%, e −0,5 a −1 ponto em cada coluna de quantidade e valor. Alargar sem devolver a diferença empurraria a última coluna para fora da folha.
- **Arquivos:** `frontend/src/components/orders/OrderValidationPdf.tsx`
- **Evidência:** papel gerado em runtime pela tela e extraído da aba (`pdftotext -layout`): `PAPEL-A-3277` sai inteiro na coluna CÓDIGO, com todas as 13 colunas na mesma linha e o total em `R$ 100,00`. Página única.
- **Efeito observável:** código de item legível no papel.
- **Ressalvas:** 10% acomoda o código com folga na fonte 6 usada na linha, mas não é ilimitado — código muito acima de ~14 caracteres ainda quebra em duas linhas dentro da célula, sem vazar.

### FIX-0022 — Miniatura de foto passou a admitir que o download falhou
- **Data:** 2026-07-29
- **Fecha:** PROB-0082
- **Área:** frontend
- **Sintoma:** quando o endpoint de conteúdo falhava (404 de foto purgada pela LGPD, timeout, rede), a miniatura ficava em **"Carregando..."** para sempre, sem como tentar de novo a não ser recarregar a página.
- **Correção:** as falhas passaram a ser registradas em **estado** (`falhas`, um `Set`), não em ref — sem re-render a tela continuaria mentindo. A miniatura mostra "Indisponível" com botão "Tentar de novo", que remove o uuid da guarda `buscados` e incrementa um contador presente nas deps do efeito, destravando exatamente uma nova tentativa. Essa e não outra porque a guarda `buscados` **tem** que continuar marcando o uuid antes do fetch: é ela que impede o laço de requisições do FIX-0008. A repetição é sob ação explícita do usuário, nunca automática.
- **Arquivos:** `frontend/src/components/orders/OrderPhotosPanel.tsx`, `frontend/src/components/orders/OrderPhotosPanel.test.tsx`
- **Evidência:** `npm test --workspace=frontend` → 72 passed. Caso novo: primeiro download rejeita com `{ response: { status: 404 } }`, a tela mostra "Indisponível" e `queryByText('Carregando...')` é nulo; o clique em "Tentar de novo" leva a contagem a exatamente 2 downloads e a imagem aparece. Os dois casos do FIX-0008 seguem passando.
- **Efeito observável:** a miniatura que falhou diz que falhou e oferece repetir.
- **Ressalvas:** uma recarga do painel (`load`) já limpava as falhas e retentava o que não estava em cache; o botão serve para o caso de não se querer recarregar a lista inteira.

### FIX-0023 — MUDANÇA DE CONTRATO: arredondamento do valor com imposto passa para o total da linha
- **Data:** 2026-07-30
- **Fecha:** BACKLOG-0065 (decisão do usuário — **não era defeito**, era escolha de arredondamento pendente)
- **Área:** backend / frontend / shared / banco (relatório de auditoria)
- **Atenção — isto não é só correção:** é **mudança de contrato de cálculo**. Pedido criado depois desta data fecha em número diferente do que fecharia antes, com a mesma entrada. Está registrado aqui porque altera valor persistido e valor impresso, não porque havia bug.
- **Sintoma:** o unitário com imposto era arredondado a 2 casas **antes** de multiplicar pela quantidade. 4 × R$ 25,50 com −10% e +10% de IPI: 22,95 × 1,1 = 25,245 → 25,25 → linha **101,00**, onde aplicar o IPI sobre o total daria 100,98. Num pedido de 2 itens, o total fechava em **202,00** e o papel imprimia `Total sem imposto R$ 183,60` com `IPI total R$ 18,40` — 10% de 183,60 é 18,36. Tela, API e PDF concordavam entre si: não havia divergência interna, havia política.
- **Correção:** decisão do usuário pela **opção (b)** do BACKLOG-0065. Em `calculateOrderItem`, `discountedRaw`/`taxedRaw` ficaram em **precisão cheia** e `money()` passou a ser aplicado apenas em `total_item_sem_imposto`/`total_item_com_imposto`. `valor_com_desconto` e `valor_com_imposto` foram declarados no código como **campos de leitura** — exibição e persistência —, nunca reusados na aritmética. `calculateOrderTotals` **não mudou**: continua somando linhas já arredondadas, que é o que o papel imprime. `previewItem` do frontend espelha o backend.
- **Correção de tabela:** `previewItem` **não normalizava a entrada** e o backend sempre normalizou (quantidades a 3 casas, preço e percentuais a 2, antes de qualquer conta). Divergência FE/BE real, sem teste que a pegasse, corrigida no mesmo passe; `ItemInput` passou a ser opcional/nullable em todos os campos.
- **Paridade forçada por dado, não por disciplina:** fixture única `shared/src/orders/calculation-cases.ts` (`ORDER_ITEM_CASES`, `ORDER_TOTALS_CASES`), no molde do BACKLOG-0057 no SAC, re-exportada em `shared/src/index.ts` e **iterada** por Jest no backend e Vitest no frontend. Antes era **um** caso de cada lado, copiado à mão, e **nenhum** dos dois distinguia as duas políticas de arredondamento — por isso a divergência era invisível.
- **Arquivos:** `backend/src/orders/order-calculation.ts`, `backend/src/orders/order-calculation.spec.ts`, `frontend/src/lib/orderCalculation.ts`, `frontend/src/lib/orderCalculation.test.ts`, `shared/src/orders/calculation-cases.ts` (novo), `shared/src/index.ts`, `backend/src/database/audits/order_calculation_divergences.sql`
- **Evidência:** `npx jest` (backend) → **51 suítes, 565 passed, 1 skipped**; `npx vitest run` (frontend) → **13 arquivos, 88 passed**; `tsc --noEmit` limpo; eslint limpo nos arquivos alterados dos dois lados. Números fixados por teste: item → `valor_com_desconto '22.95'`, `valor_com_imposto '25.25'`, `total_item_sem_imposto '91.80'`, `total_item_com_imposto '100.98'`; pedido de 2 itens → `total_sem_imposto '183.60'`, `ipi_total '18.36'`, `total_com_imposto '201.96'`.
- **Evidência em runtime (2026-07-30, BACKLOG-0068):** app subido (Postgres em Docker :5433, backend :3000, frontend :5173) e **sessão real** na aba logada do Safari (`osascript … do JavaScript`, cookie `HttpOnly`, `credentials: 'include'`). **API** (pedido nº 19): `total_sem_imposto "183.60"`, `total_com_imposto "201.96"`; item `qtd_total "4.000"`, `valor_com_desconto "22.95"`, `valor_com_imposto "25.25"`, `total_item "91.80"`, `total_com_imposto "100.98"`; IPI derivado 18.36 = 10% de 183,60. **Tela** (`/pedidos/:uuid/editar`, lida do DOM): rodapé `R$ 183,60` / `R$ 201,96`, linha `Sem IPI: R$ 91,80 · Com IPI: R$ 100,98` — idêntico à API. **Papel** (pedido nº 20, `pdftotext -layout`): `Valor bruto R$ 204,00`, `Desconto total R$ 20,40`, `Total sem imposto R$ 183,60`, `IPI total R$ 18,36`, `Total final R$ 201,96` — antes eram 18,40 e 202,00. Dados de teste (stamp `QA65594440`) removidos ao fim, com busca devolvendo 0.
- **Resultado:** **PASS** — verde na suíte automatizada **e** confirmado nas três camadas em runtime. As ressalvas abaixo continuam válidas; nenhuma delas foi invalidada pela execução.
- **Efeito observável:** o total do pedido muda em centavos por linha, para cima ou para baixo conforme o caso, e o `IPI total` do papel passa a bater com o percentual sobre a base.
- **Ressalvas:**
  1. **`total_item` deixa de ser exatamente `qtd_total × valor_com_desconto`** quando o unitário não é exato. É o trade-off aceito da opção escolhida, e **nenhum CHECK no banco verifica essa coerência** — quem reconferir a linha por multiplicação vai encontrar a diferença.
  2. **PDF — ressalva menor do que a registrada originalmente.** Nenhuma fórmula precisou mudar; `IPI total` já era `withTax − withoutTax`. A versão inicial desta entrada afirmava que multiplicar a coluna do papel daria 101,00 contra 100,98 impresso: **estava errado**, e a verificação em runtime corrigiu. A coluna de total por linha é a **sem** imposto (`TOTAL S/IMP`, `OrderValidationPdf.tsx:150`) e `VLR C/ IMP` é unitário **informativo**, nunca multiplicado nem totalizado — não existe coluna de total com imposto por linha. O que sobra é a mesma diferença na coluna `VLR. COM DESC.`, e só quando o unitário com desconto não é exato: no caso medido 22,95 × 4 = 91,80 **fecha**; no caso de dízima da fixture (R$ 10,00 com 33,33%), 6,67 × 3 = 20,01 contra `TOTAL S/IMP` 20,00. Decisão separada em BACKLOG-0069, reclassificado como informativo.
  3. **Pedidos históricos não são regravados.** O inventário de quem diverge é `backend/src/database/audits/order_calculation_divergences.sql`, e abrir/salvar um pedido antigo o recalcula sob a política nova — BACKLOG-0070.
  4. **Descoberto e NÃO corrigido:** `new Decimal(value ?? 0)` **lança** com string vazia (mesma classe do BACKLOG-0057 no SAC). Sem caminho HTTP hoje (o DTO exige `@IsNumber`), mas import de CSV ou chamada direta ao service responderia **500** — BACKLOG-0067.
  5. **[PROB-0065](PROBLEM_LEDGER.md) segue ABERTO e não foi tocado:** o push de sync grava `total_item` direto, sem passar por `calculateOrderItem`, então é uma segunda porta de escrita que **não conhece esta política**. A verificação em runtime **não** exercitou esse caminho.
  6. ~~**Nenhuma validação em runtime.**~~ **Executada em 2026-07-30** — ver a linha de evidência acima e BACKLOG-0068, FECHADO. Continuam sem verificação: o relatório SQL de auditoria (nunca executado contra banco nenhum) e **produção**.
- **Relacionado:** BACKLOG-0065, BACKLOG-0057, BACKLOG-0067, BACKLOG-0068, BACKLOG-0069, BACKLOG-0070, BACKLOG-0071, [PROB-0065](PROBLEM_LEDGER.md)

### FIX-0024 — Trocar o fornecedor deixou de descartar os itens do pedido
- **Data:** 2026-07-30
- **Fecha:** BACKLOG-0066
- **Área:** frontend
- **Sintoma:** em `/pedidos/novo` e `/pedidos/:uuid/editar`, o `onChange` do select de fornecedor executava `setItems([newItem()])`. Toda linha digitada sumia na hora, sem confirmação, sem mensagem e sem desfazer. Foi o que apagou os itens preenchidos na primeira execução da suíte automatizada de tela.
- **Correção:** decisão do usuário pela **alternativa** do critério de aceite — **preservar as linhas e desvincular o produto**, e **não** pedir confirmação: com a operação deixando de ser destrutiva, um diálogo só acrescentaria clique. `handleSupplierChange(nextUuid)` substituiu o `onChange` inline; é no-op quando o fornecedor é o mesmo; linha **com produto** zera `produto_uuid`, `codigo_manual`, `descricao_manual` e `preco_unitario` e ganha `precisa_produto: true`, **preservando** `uuid`, `qtd_caixas`, `qtd_unitaria`, `desconto_perc` e `ipi_perc`; linha **manual** (sem `produto_uuid`) fica intocada, porque não depende do fornecedor.
- **Por que flag explícita e não `produto_uuid === ''`:** linha recém-adicionada também está sem produto e **não** é órfã. Derivar a marca do campo vazio marcaria de amarelo toda linha nova. `chooseProduct` e `updateItem` limpam a marca — escolher um produto, ou digitar código/descrição, que é linha manual e é válida.
- **Ganho que o enunciado não previa:** preservar o `uuid` do item impede que o **PUT seguinte apague os itens no backend** (o PUT envia `itens` completo) e mantém os rótulos de foto do `OrderPhotosPanel`, que chaveia `itemLabels` por `item.uuid`. O comportamento antigo perdia os dois, e isso valia para **edição de pedido persistido**, não só para digitação em andamento.
- **Arquivos:** `frontend/src/pages/PedidoForm.tsx`, `frontend/src/pages/PedidoForm.spec.tsx` (novo — **primeiro teste de componente desta tela**)
- **Evidência:** `npx vitest run` → **13 arquivos, 88 passed**; `tsc --noEmit` e eslint limpos. Casos novos: preserva as linhas e desvincula o produto; reselecionar o mesmo fornecedor é no-op; linha manual intacta; submit **bloqueado** com linha pendente e liberado ao escolher novo produto.
- **Evidência em runtime (2026-07-30, BACKLOG-0068):** em `/pedidos/:uuid/editar` de pedido com 2 itens **persistidos**, trocando Fornecedor A → B pelo select, com sessão real. Antes: 2 itens, caixas `["4.000","4.000"]`, desconto `["10.00","10.00"]`, IPI `["10.00","10.00"]`, produto preenchido. Depois: ainda **2 itens**, caixas/desconto/IPI **idênticos**, produto vazio nas duas, `aria-invalid="true"` nos dois selects e banner `O fornecedor mudou: 2 itens precisam de um novo produto. Quantidades e percentuais foram preservados.`. Submit com linha pendente → alerta `Cada item precisa de um produto ou de código/descrição manual.` e **o servidor não mudou** (2 itens, total intacto). Escolhido o Produto B nas duas linhas: banner some, IPI passa a `5.00` (vem do produto), código atualizado, quantidades preservadas; save redireciona. **`uuid` dos itens antes == depois** (`104dff6f-…`, `438fb7fa-…`). Totais recalculados: `216.00` / `226.80`. Dados de teste removidos ao fim.
- **Resultado:** **PASS** — verde na suíte **e** confirmado ponta a ponta contra o backend real.
- **Efeito observável:** trocar o fornecedor mantém as quantidades e os percentuais digitados, marca em âmbar as linhas que perderam o produto e exibe um banner `role='status'` contando quantas são; o select da linha pendente recebe `aria-invalid`.
- **Ressalvas:** o bloqueio de submit **reusa** a validação que já existia em `submit()` ("Cada item precisa de um produto ou de código/descrição manual") — **nenhuma regra de validação nova** foi criada, então uma linha pendente é recusada pela mesma mensagem genérica de sempre, que **não diz qual linha** (confirmado em runtime: o alerta é o texto genérico). ~~O teste de componente não prova o ganho de preservar o `uuid` contra o backend real.~~ **Provado em runtime**: os uuids sobrevivem ao PUT. As demais telas de formulário do sistema seguem sem teste de componente (BACKLOG-0061).
- **Relacionado:** BACKLOG-0066, BACKLOG-0061, BACKLOG-0068


### FIX-0025 — Foto do pedido substituída por foto do produto: os defeitos da migração, fechados
- **Data:** 2026-07-30
- **Fecha:** os itens P0-3, P1-1, P1-2, P1-3, P1-4, P2-3 e P2-5 da revisão independente de 2026-07-30 (registrados em `docs/ErrosAtuais.md`, arquivo temporário removido em 2026-07-31)
- **Área:** backend / frontend / banco
- **Sintoma e correção, item a item:**
  - **Papel do pedido saía com fotos faltando, em silêncio.** `PedidoDetalhe.tsx` disparava um GET por produto distinto com `Promise.all` sem limite, e o `.catch(() => null)` engolia o 429 do throttler. Pedido com 120 produtos distintos → papel incompleto sem aviso; o modelo antigo tinha teto de 10 fotos por pedido, que sumiu com a feature. Correção: `mapComLimite` (`frontend/src/lib/promisePool.ts`) segura a fila em 6 downloads simultâneos; `fetchFotosPorProduto` trata 404 como ausência normal, faz retry com backoff em 429/5xx/rede, falha de imediato em 403 e lança `FotosDoPapelIndisponiveisError` se sobrar falha — **o PDF não é emitido** e o banner diz quantas fotos faltaram. *Correção de premissa da própria revisão:* o balde do `@nestjs/throttler` v6 é **por rota** (`generateKey` = `sha256(classe-handler-nome-tracker)`), então o esgotamento nunca vazava para o resto da API — o defeito central era real, o raio de alcance é que era menor.
  - **Falha no upload da foto duplicava o produto.** O POST criava o produto e o upload vinha depois; falhando o upload, a tela mostrava o erro e não navegava, e o segundo Salvar chamava `withGeneratedUuid` de novo, gerando **uuid novo** e um segundo POST. Correção em três camadas: `createIdempotente` (`backend/src/common/persistence/idempotent-create.ts`) busca com `withDeleted`, insere e, em 23505, **relê por uuid** — achou, é corrida e devolve o existente; não achou, a violação é de outro índice e o erro sobe intacto. Migration `0041_produto_codigo_unico.sql` com índice parcial `(tenant_id, fornecedor_id, codigo) WHERE codigo IS NOT NULL AND deleted_at IS NULL`. `useUuidDeCriacao` faz o uuid nascer com a **intenção** de criar, não no submit, aplicado em todas as telas de criação; `entityPayload.ts`/`withGeneratedUuid` foi **removido** — gerar uuid no submit era o defeito.
  - **Purga da foto commitava antes do soft delete do produto.** `removeByProductId` abria e commitava transação própria; um erro no `softDelete` seguinte deixava os bytes zerados irreversivelmente com o produto vivo. Correção: `removeByProductId(produtoId, tenantId, manager?)` — com manager usa o de quem chamou (formato de `AuditService.record`, precedente do repo) — e `ProductsService.remove` envolve purga e `softDelete` num único `dataSource.transaction`.
  - **Campo de foto invisível para quem só tem `produtos.criar`.** Correção: `RequireAnyPermission` + `REQUIRED_PERMISSION_MODE_KEY`; o `PermissionGuard` escolhe `some` ou `every` pela metadata e **ausência de modo continua sendo AND** — nenhuma rota já escrita muda. `PUT` da foto aceita `produtos.criar` OU `produtos.editar`; `DELETE` fica em `produtos.editar`.
  - **As duas garantias centrais sem teste, e asserções que passariam com o código quebrado.** Causa comum: cada spec reinventava o fake de query builder, e o de fotos devolvia UM objeto para todas as queries. Correção: `backend/src/common/testing/query-builder.mock.ts` — cada `createQueryBuilder()` devolve builder novo, registrado por alias e por ordem.
  - **Endpoints de bytes sem `@Throttle` próprio.** Os dois `GET` de conteúdo receberam `@Throttle({ default: { ttl: 60_000, limit: 300 } })` — papel de pedido grande é rajada legítima; 300 acomoda e ainda barra varredura de catálogo.
- **Arquivos:** `frontend/src/lib/promisePool.ts`, `frontend/src/services/productPhotos.service.ts`, `frontend/src/services/products.service.ts`, `frontend/src/hooks/useUuidDeCriacao.ts`, `frontend/src/pages/ProdutoForm.tsx`, `backend/src/common/persistence/idempotent-create.ts`, `backend/src/common/errors/pg-error.ts`, `backend/src/common/decorators/require-permission.decorator.ts`, `backend/src/common/guards/permission.guard.ts`, `backend/src/common/testing/query-builder.mock.ts`, `backend/src/products/`, `backend/src/database/migrations/0041_produto_codigo_unico.sql`
- **Evidência:** backend **56 suítes / 602 passed, 1 skipped**; frontend **17 arquivos / 107 passed**; shared 9. Mutação conferida: trocar `expectedVersion: version` por `photo.version` no service faz a suíte falhar. Invariantes da `0041` exercitadas no dev em transação revertida: mesmo código no mesmo fornecedor → 23505 `uq_produtos_codigo`; em outro fornecedor → `INSERT 0 1`; soft delete libera o código; dois `codigo` NULL não colidem. **Verificação em navegador (Safari, sessão real, 2026-07-30):** 14 GETs para 14 produtos distintos, pico de **6** em voo (era 14), PDF de 843.313 B com **14 JPEGs** 480×320 confirmados por `pdfimages -list`, item manual com célula de FOTO vazia; com o teto baixado para 3 de propósito, 3×200 + 33×429 e **PDF não gerado**, com o banner contando as 11 fotos que faltaram. No cadastro de produto: upload falhando → banner "produto salvo, foto não subiu", **1** produto antes e depois da retentativa, 409 de código duplicado, 201 em outro fornecedor, POST repetido com o mesmo uuid → mesmo registro e 1 linha.
- **Efeito observável:** o papel do pedido nunca sai incompleto em silêncio — ou vem com todas as fotos, ou não é emitido, com o número de faltantes na tela. Falha de upload não gera produto duplicado, e quem só tem `produtos.criar` consegue anexar a foto do produto que acabou de cadastrar.
- **Ressalvas:** P1-3 **não foi verificado em navegador** — exigiria um segundo perfil (`produtos.criar` sem `produtos.editar`) e outra sessão, e a suíte não pode tocar `/login`; está coberto por teste (`product-photos.permissions.spec.ts` trava a permissão dos quatro endpoints). A verificação de navegador do cadastro de produto rodou de um arquivo temporário, fora de `phases.js` — **não era reproduzível a partir do repositório**; foi persistida como fase `p3b` em FIX-0026.
- **Relacionado:** FIX-0026, PROB-0075, PROB-0083, BACKLOG-0074, BACKLOG-0075

### FIX-0026 — Foto de catálogo alinhada ao que o inventário de PII declara, e QA de tela sem fase morta
- **Data:** 2026-07-31
- **Fecha:** os itens P2-1, P2-2, P3-1, P3-2 e P3-3 de `docs/ErrosAtuais.md` (arquivo removido nesta data)
- **Área:** LGPD / banco / backend / frontend / infra de teste
- **Sintoma:** o inventário de PII declarava um controle inexistente. A regra de ERASURE de `produto_fotos` gerava `... WHERE tenant_id = $1 AND origem_pedido_id IN (SELECT id FROM pedidos ...)` — e **nenhum caminho de código escrevia `origem_pedido_id`**: `ProductPhotosService.upsert` gravava `null` sempre, e a única fonte possível era o bloco de migração da `0040`, que roda sobre `pedido_fotos` vazia. O comando nunca casava linha nenhuma. Pior: se a coluna voltasse a ser preenchida, o ERASURE de **um** cliente apagaria a foto de catálogo que os pedidos de todos os outros também usam. Em paralelo, a tela não avisava nada sobre PII, o único `FOR UPDATE` cru do backend travava por `id` sem `tenant_id`, e a suíte de Safari mantinha uma fase inteira (`p7b`) testando a feature removida.
- **Correção:**
  - **Migration `0042_produto_fotos_sem_origem_pedido.sql`** — dropa `fk_produto_fotos_tenant_pedido_origem` e a coluna `origem_pedido_id`, precedida de guarda que **aborta** a migration se existir linha com a coluna preenchida (mesma filosofia do `CREATE UNIQUE INDEX` da `0041`: premissa que não vale devolve a decisão ao humano). A `0040` **não foi editada** — está aplicada e é imutável (PROB-0072).
  - **`produto_fotos` saiu de `PII_REGISTRY` e entrou em `TABELAS_SEM_PII`**, com justificativa escrita: não é isenta por ser inócua, é isenta por **não ter titular**. Manter regra que não alcança linha nenhuma esconde o risco em vez de registrá-lo. A spec de inventário continua obrigando toda tabela com `tenant_id` a estar classificada de um dos dois lados.
  - **Aviso de PII na tela** (`ProductPhotoField.tsx`), `role='status'` no padrão âmbar já usado em `PedidoForm`/`SacForm`, visível só para quem pode subir: a foto é do catálogo, é compartilhada por todos os pedidos e **não** é alcançada por solicitação de exclusão — não subir nota fiscal, documento ou foto com dado de cliente. É o controle que substitui o controle imaginário.
  - **Lock do `upsert` no padrão do repositório**: `manager.query('SELECT id FROM produtos WHERE id = $1 FOR UPDATE')` virou `manager.findOne(Product, { where: { id, tenant_id, deleted_at: IsNull() }, lock: { mode: 'pessimistic_write' } })`, como em `orders.service.ts`, `sac.service.ts` e `faturamento.service.ts`. Ganho além do estilo: a primeira leitura do produto acontece **fora** da transação, e a releitura travada fecha essa janela — produto excluído nesse intervalo agora dá 404 em vez de gravar foto para produto inexistente.
  - **`ops/qa-safari`**: a fase `p7b` inteira (upload pelo detalhe do pedido, `GET /pedidos/:uuid/fotos`, rádio "Usar no papel") foi removida — rota e UI não existem desde a `0040`. No lugar entrou **`p3b`**, que cobre o fluxo atual e persiste o roteiro que a verificação do P1-1 rodou de arquivo temporário: upload real, aviso de PII na tela, falha de upload injetada em `fetch` sem duplicar produto, retentativa, código único por fornecedor e replay do mesmo uuid. `gerarPdf` passou a contar `/Subtype /Image` e a `p8` exige **≥ 1 imagem embutida** — contar páginas não prova que a foto chegou ao papel. Removida também a asserção de `p7c` que **não podia falhar** (contava `input[type=file]` numa tela que não tem mais nenhum). `nativeSet` e `labelOf` foram exportados em `qa.js` para a fase nova reusar o setter existente em vez de reimplementá-lo.
- **Arquivos:** `backend/src/database/migrations/0042_produto_fotos_sem_origem_pedido.sql`, `backend/src/products/entities/product-photo.entity.ts`, `backend/src/products/product-photos.service.ts`, `backend/src/privacy/pii-registry.ts`, `backend/src/privacy/privacy.service.spec.ts`, `backend/src/privacy/pii-registry.spec.ts`, `frontend/src/components/products/ProductPhotoField.tsx`, `ops/qa-safari/phases.js`, `ops/qa-safari/qa.js`, `ops/qa-safari/run.sh`, `ops/qa-safari/README.md`, `AGENTS.md`
- **Evidência:** `npm run lint/build --workspace=backend` limpos; `npm test --workspace=backend` → **56 suítes, 602 passed, 1 skipped**. `npm run lint/build --workspace=frontend` limpos; `npm test --workspace=frontend` → **17 arquivos, 109 passed** (eram 107); `npm test --workspace=shared` → 9. `db:migrate` no dev → `Migration aplicada: 0042_produto_fotos_sem_origem_pedido.sql`; `db:verify` → `OK: schema íntegro` (34/34 CHECKs, 8/8 índices parciais, 0 FK sem isolamento). Estado da tabela conferido por `psql`: sem `origem_pedido_id`, sem a FK de pedido, com os 4 CHECKs + `version_check`, a FK composta de produto e `uq_produto_fotos_produto` intactos. **Guarda da `0042` exercitada**: em transação revertida, recriando a coluna e marcando uma linha, o bloco aborta com `ERROR: produto_fotos tem linha com origem_pedido_id nao nulo…`. `node --check` em `qa.js`/`phases.js` e `bash -n` em `run.sh`. **Suíte de Safari executada ponta a ponta (2026-07-31, sessão real, stamp `QA944966`):** `p0`→`p14`, **285 asserções**, 0 erro de console/HTTP capturado. A `p3b` nova saiu **verde nas 41 asserções**: aviso de PII visível na tela, upload gravado (`200`, `image/jpeg`, `Cache-Control: private`), falha de upload injetada em `fetch` → banner "o produto foi salvo, mas a foto não subiu" com os dois botões, **1 produto** antes e depois da retentativa, foto subindo na segunda tentativa, `409` "Código COD-QA944966 já cadastrado para este fornecedor", `201` no outro fornecedor, e replay do mesmo uuid → `201`/`201` com o **mesmo** registro e **1** linha no catálogo. `p8` e `p8b`: `application/pdf`, `%PDF-1.3`, 387.876 B / 387.845 B, 1 página, **4 imagens embutidas**. Conferido fora do navegador com `pdfimages -list` (2 JPEGs 480×320 — um por linha de item — mais o logo com a máscara alfa) e `pdftotext -layout` (coluna FOTO presente; `183,60` / `IPI total 18,36` / `201,96`). `p14` devolveu **204 em todos os 12 alvos**, incluindo os três produtos extras que a `p3b` registra em `st.ids.extras`; banco de dev de volta a **4 produtos / 7 pedidos / 0 fotos ativas / 0 bytes vivos** e **0** resíduo do stamp.
- **Efeito observável:** quem cadastra produto vê o aviso de PII junto ao campo de foto. Um ERASURE de cliente não emite mais comando algum contra `produto_fotos` — e nenhuma foto de catálogo compartilhada pode ser apagada pelo pedido de exclusão de um único cliente. Na suíte de tela, a verificação do cadastro de produto com foto passou a ser **reproduzível a partir do repositório** (`./run.sh phase p3b`) — antes existia só como arquivo temporário.
- **Defeito do próprio driver, achado e corrigido na execução:** a `p8` reprovou com `text/javascript`, `";u82=Uin"` e 0 páginas — e o papel estava perfeito. `armarCapturaPdf` guardava o **primeiro** blob que passasse por `URL.createObjectURL`, e o Vite em dev cria blob de módulo (`text/javascript`) ao resolver o import dinâmico do gerador de PDF, que é justamente como `PedidoDetalhe` o carrega. O hook passou a **ignorar blob do carregador de módulos** (`text/javascript`, `application/javascript`, `text/css`) e só eles — qualquer outro tipo continua sendo capturado, para a asserção de MIME poder reprovar de verdade se o app gerar coisa errada. Depois da correção, a mesma fase: `application/pdf`, 387.876 B, 1 página, 4 imagens. **Isto valida a asserção nova**: contar páginas nunca teria denunciado nada, e a de imagem embutida é que mostrou que o artefato conferido não era o papel.
- **Ressalvas:** o risco residual de PII no binário do catálogo não é eliminável por código e ficou registrado em PROB-0083. O desempate do `DISTINCT ON` da `0040` **não foi corrigido**, de propósito: migration aplicada é imutável — registrado em BACKLOG-0073.
- **Relacionado:** FIX-0025, PROB-0075, PROB-0083, BACKLOG-0073, BACKLOG-0076, BACKLOG-0077, [REVIEW_REPORTS/2026-07-31_fix_foto-de-catalogo-sem-titular-e-qa-sem-fase-morta.md](REVIEW_REPORTS/2026-07-31_fix_foto-de-catalogo-sem-titular-e-qa-sem-fase-morta.md)

### FIX-0027 — Pedido tem uma porta de escrita só: o push de sync parou de furar a máquina de estados
- **Data:** 2026-07-31
- **Fecha:** PROB-0065
- **Área:** backend / segurança
- **Sintoma:** invisível para quem usa a web, e é esse o problema. Um device com `pedidos.editar` podia mandar `{"status":"faturado"}` no push e o pedido virava faturado sem nota fiscal; podia rebaixar pedido faturado para `em_aberto` e então editá-lo pela REST, furando o bloqueio de lá; podia gravar `total_item` calculado com a aritmética anterior a FIX-0023, deixando a linha com centavos a mais e o cabeçalho do pedido sem recálculo; e podia excluir pedido com nota fiscal ativa, porque o DELETE do v1 nem lia a linha antes de marcar `deleted_at`.
- **Correção:** o núcleo de escrita de pedido saiu de dentro do `OrdersService` para `backend/src/orders/order-write.ts` — módulo de funções que recebem o `EntityManager` de quem chama, na convenção que `order-calculation.ts` e `order-ownership.ts` já usavam. `OrdersService` delega a ele e o push de sync passa por `sync/writers/orders-sync.writer.ts`, que chama as mesmas funções. Não é uma camada nova por cima da velha: a derivação de item e a soma de totais têm **uma** implementação.
  No contrato de campos, a `SyncEntityPolicy` ganhou uma terceira categoria, `derivedFields`, distinta de `serverControlledFields`: identidade e auditoria o cliente não tem como conhecer, mas total de item ele calcula — e a mensagem de recusa precisa dizer o que enviar no lugar, senão o device fica em retry sem saber o que corrigir. `status` virou server-controlled e os totais viraram derivados **para toda origem**; `total_item` saiu da allowlist do item e `ipi_perc` entrou, porque é insumo legítimo e sem ele todo item vindo do sync nasceria com IPI zero.
  Com a decisão deixando de depender da linha lida, `writableFieldsFor` e a segunda passada de allowlist (`assertCamposDaForma`) ficaram sem função e foram removidas — gancho ligado a função identidade é peso morto. A proteção que PROB-0074 comprou ficou **mais forte**: vale para toda origem, num gate mais cedo, sem ida ao banco.
- **Arquivos:** `backend/src/orders/order-write.ts` (novo), `backend/src/sync/writers/orders-sync.writer.ts` (novo), `backend/src/sync/sync-write-boundary.spec.ts` (novo), `backend/src/sync/sync-entity-policy.ts`, `backend/src/sync/sync.service.ts`, `backend/src/sync/sync.module.ts`, `backend/src/orders/orders.service.ts`
- **Evidência:** `npm test --workspace=backend` → **669 passed**, 1 skipped, 59 suítes (eram 606/56 antes). `npm run lint --workspace=backend` e `npm run build --workspace=backend` limpos. A prova de que a extração não mudou o comportamento da web é `orders.service.spec.ts` passar **sem edição** (64 casos). Os dois pins que fixavam `status` como gravável em pedido interno (`sync.service.spec.ts`) foram invertidos — existiam justamente para que fechar isto fosse decisão, não efeito colateral.
- **Efeito observável:** push que mande `status` ou total recebe recusa terminal — `rejected`/`VALIDATION_FAILED`/`retryable:false` no v2, `error` com a mensagem no v1 — e a mensagem dos derivados lista os insumos a enviar. Item escrito pelo sync sai com os cinco campos derivados preenchidos e o cabeçalho do pedido recalculado na mesma transação. Editar pedido fora de `em_aberto` pelo push passou a ser recusado em **qualquer** origem (antes só na externa). Excluir pedido com nota ativa é recusado nos dois protocolos. O UPDATE do v1 passou a incrementar `version`, então escrita de sync deixou de ser invisível para a concorrência otimista da web — e um usuário com a versão velha agora vê 409 onde antes sobrescrevia em silêncio.
- **Ressalvas:** ownership de vendedor continua sem checagem no push — o sync nunca teve o ator, só o tenant. Não foi inventado um `sub` para preencher a lacuna; ela virou BACKLOG-0078, é anterior a este trabalho e vale para todas as entidades. Um cliente mobile implantado **fora desta árvore** que ainda mande `status`/`total_item` passa a receber recusa e, no v1 desta árvore, item recusado nunca sai da fila (`incrementRetry` sem teto para erro de negócio) — por isso a recusa virou log estruturado `sync_write_rejected`, para o loop ser observável em vez de silencioso. Nesta árvore, `enqueue` não tem nenhum chamador e não há tela de pedido no app: nada que exista aqui envia esses campos. `mobile/` não foi alterado nem validado (`AGENTS.md`).

### FIX-0028 — Perfil de acesso: a tela oferecia nomes que o backend não sabia provisionar
- **Data:** 2026-07-31
- **Fecha:** PROB-0057 (sucessor)
- **Área:** backend / frontend / segurança
- **Sintoma:** criar usuário pela tela **Usuários** com o perfil padrão do formulário (`viewer`) — ou com `manager` — criava uma `tenant_role` real e **sem nenhuma permissão**. O usuário logava com sucesso e tomava 403 em toda tela, sem nada apontar a causa. É o mesmo sintoma operacional que PROB-0057 descrevia, por outro mecanismo, e o fix do guard não cobria.
- **Causa raiz:** quatro vocabulários de perfil independentes. O backend só sabia provisionar `admin`/`gestao`/`vendedor`/`financeiro` (`DEFAULT_ROLE_PERMISSIONS`), com fail-closed documentado — nome fora do mapa vira role vazia. A tela de Usuários oferecia `admin`/`manager`/`viewer` e usava `viewer` como default; `lib/authorization.ts` rotulava um terceiro conjunto (`gerente`, `operador`); `AuditoriaPage` tinha o quarto. E `normalizeRoleName` caía em `'viewer'` quando o papel não vinha.
- **Correção:** a lista de perfis atribuíveis e seus rótulos passaram a viver em `@renowa/shared` (`ROLE_TEMPLATES`, `formatRoleName`), ao lado do mapa de permissões que o backend usa para provisionar. No backend, `normalizeRoleName` deixou de inventar default e `resolveAssignableRole` decide: perfil que já existe no tenant — inclusive os criados sob medida na tela de Perfis — é usado como está; perfil inexistente só é provisionado se houver template; fora disso, **400** listando os modelos. Vale para criação e para troca de perfil. No frontend, as três listas foram substituídas pela do catálogo, e o formulário de novo usuário deixou de vir com perfil pré-selecionado — default aqui é escolher privilégio por omissão.
  Junto saiu o resíduo da arquitetura anterior: `getCurrentUserContext` criava `local_users` implicitamente com e-mail forjado (`${sub}@placeholder.local`) e perfil vindo do `defaultRole` do JWT — signup silencioso, inalcançável porque o `LocalUserContextGuard` recusa antes, mas vivo no código. E `findTenantRoleByName`, sem chamador.
- **Arquivos:** `shared/src/permissions/catalog.ts`, `backend/src/users/users.service.ts`, `backend/src/users/users.controller.ts`, `frontend/src/pages/configuracoes/UsuariosPage.tsx`, `frontend/src/lib/authorization.ts`, `frontend/src/pages/configuracoes/AuditoriaPage.tsx`, `frontend/vite.config.ts`, `docs/DEPLOY_HOSTINGER.md`
- **Evidência:** `npm test --workspace=shared` → 13 passed (4 novos, fixando que a lista oferecida e a provisionável são a mesma). `npm test --workspace=backend -- users.service.provisioning` → 8 passed, incluindo a recusa de `viewer`/`manager` sem criar role vazia e o 403 de `getCurrentUserContext` sem `local_user`. `npm run lint|build --workspace=frontend` limpos, `npm test --workspace=frontend` → 109 passed.
- **Efeito observável:** o select de perfil mostra Administrador / Gestão / Vendedor / Financeiro, com os mesmos rótulos na Auditoria e na sidebar. Perfil desconhecido responde 400 dizendo o que fazer, em vez de criar acesso quebrado. Perfil sob medida criado em **Perfis** continua atribuível e aparece no select ao editar o usuário.
- **Ressalvas:** usuários já criados com perfil vazio **não** são migrados — a correção impede novos casos. Conferir com a query da seção 4 do `DEPLOY_HOSTINGER.md`, que passou a comparar com a tabela `permissions` em vez de um número fixo (dizia 28; hoje são 32).

### FIX-0029 — `db:verify` passou a enxergar a infra de sync que sumia sem deixar rastro
- **Data:** 2026-07-31
- **Fecha:** PROB-0061
- **Área:** banco / infra
- **Sintoma:** `0008`/`0009` constavam aplicadas em `schema_migrations` e seus objetos não existiam no banco de dev — push/pull do mobile quebrado em runtime, com o verificador de schema passando limpo.
- **Correção:** os objetos em si já haviam sido restaurados em 2026-07-29 (reaplicação via `psql`, registrada no fechamento de PROB-0072). O que faltava era o verificador enxergar o que some: `verify-schema.ts` ganhou a seção `[5/7]`, cobrindo a sequence `sync_change_revision_seq`, os seis triggers `trg_*_sync_outbox` e a coluna `version` das seis tabelas da `0009`. O ponto cego era estrutural: a seção de triggers filtrava por `set_updated_at`, e `CREATE OR REPLACE FUNCTION` restaura a função sem restaurar os triggers — um banco podia ter `capture_sync_outbox()` viva e nenhum trigger chamando-a.
- **Arquivos:** `backend/src/database/verify-schema.ts`
- **Evidência:** `DATABASE_URL=…@localhost:5433/renowa npm run db:verify --workspace=backend` → `[5/7] 14/14 objetos de sync presentes` e verdito `OK: schema íntegro`, PostgreSQL 15.18.
- **Efeito observável:** drift de infra de sync passa a reprovar o `db:verify` com exit 1, em vez de aparecer só quando um device tenta sincronizar.
- **Ressalvas:** **produção continua sem verificação** — é BACKLOG-0041 (P0) e exige janela e `DATABASE_URL` de produção. Este trabalho entrega a ferramenta, não a execução. A causa mecânica candidata (BACKLOG-0035) não é mais reproduzível: nenhum dos 35 arquivos `.sql` tem controle de transação próprio, e `migrations-hygiene.spec.ts` transforma isso em teste.
