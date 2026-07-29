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
