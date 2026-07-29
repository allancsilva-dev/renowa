# Fechamento das pendências da auditoria de 2026-07-29

**Data:** 2026-07-29 · **Repo:** `/Users/Zero/Projetos/renowa`, branch `master`
**Escopo:** `backend/`, `frontend/`, `shared/`, `.github/`, `docs/`. **`mobile/` não foi alterado nem validado** (`AGENTS.md:6-8`).
**Nada foi commitado.** Tudo segue no working tree.

Entrada: o plano de handoff derivado de
[2026-07-29_audit_fotos-pedido-externo-sac.md](2026-07-29_audit_fotos-pedido-externo-sac.md),
auditado contra o repo antes de executar. O relatório de auditoria continua como está;
este aponta o que nele estava errado.

---

## Resultado

| Item | Antes | Depois |
|---|---|---|
| PROB-0072 — `db:migrate` travado | BLOCKER, ABERTO | **FECHADO** |
| PROB-0073 — `UNIQUE(tenant_id, id)` | PARCIALMENTE_RESOLVIDO | **FECHADO** |
| PROB-0074 — gate de origem no sync | ABERTO | **FECHADO** |
| PROB-0075 — purga LGPD | ABERTO | **FECHADO** |
| PROB-0065 — sync escreve `status` | ABERTO | ABERTO (restrito a origem interna) |
| PROB-0076 — PII de terceiro | — | **NOVO, ABERTO** |
| BACKLOG-0048 / 0052 / 0055 / 0056 / 0057 | ABERTO / PARCIAL | **FECHADOS** |
| BACKLOG-0054 | ABERTO | **PARCIAL** (registro e teste estático entregues) |
| BACKLOG-0049 | ABERTO, bloqueado | ABERTO, **desbloqueado** |
| BACKLOG-0053 | ABERTO | ABERTO, dependência explicitada |
| Banco de dev | 19 migrations, `0032`, `db:verify` reprovando | **24 migrations, `0037`, `db:verify` limpo** |
| Testes | backend 405 · shared e frontend fora do CI | backend **500** · shared **9** · frontend **58**, todos no CI |

Detalhe de cada correção com evidência: [BUGFIX_LOG.md](../BUGFIX_LOG.md), FIX-0001 a FIX-0007.

---

## O plano estava certo no essencial

Antes de executar, cada afirmação estrutural foi conferida contra o repo. O bloqueador,
os arquivos, os símbolos e as cinco "correções ao relatório de auditoria" do plano se
confirmaram. Em particular:

- `git show c5fa24a:…0007_optimistic_concurrency.sql | shasum -a 256` bate **exatamente**
  com o hash da allowlist proposta.
- m8 é mesmo falso positivo: `orders.service.ts:39-45` são wrappers de uma linha para
  `order-ownership.ts`.
- `serverControlledFields` não era lido em runtime por arquivo nenhum de `backend/src/sync/`.
- `origem` é escrita só na criação e nunca atualizada — a base do gate do Passo 3.
- O CI de fato usa clone raso, o que torna a fixture versionada obrigatória.

Os números de linha citados no plano tinham desvio de 1 a 3 linhas em vários pontos. Sem
consequência: os símbolos existem. Vale como lembrete de ancorar em nome, não em linha.

---

## Sete pontos em que a execução divergiu do plano

### 1. `0034` **não** foi editada — o plano pedia, e teria re-quebrado o `db:migrate`

O plano mandava corrigir a afirmação falsa no cabeçalho de `0034_pedido_fotos.sql`. Mas
`0034` já está aplicada, e o runner trata migration aplicada como imutável: reescrever o
arquivo — **inclusive só um comentário** — muda o checksum e re-dispara exatamente o
PROB-0072 que o Passo 1 acabara de destravar, em todo banco que já a aplicou.

A correção foi para o relatório de implementação e para `LGPD_ARCHITECTURE.md`, e a `0037`
explica no próprio cabeçalho o que passou a ser verdade. `AGENTS.md` ganhou a regra.

### 2. `db:verify` ganhou duas seções, não uma — o plano checava o sintoma

O plano propunha verificar `UNIQUE(tenant_id, id)`. Mas o PostgreSQL **já recusa** FK
composta sem índice único no alvo (42830), então "alvo de FK tem o índice" é garantido
pelo banco e verificar isso não acrescenta nada.

O que ninguém verificava é a doença: **FK para tabela com `tenant_id` que omite
`tenant_id` na chave** permite referência cross-tenant, e é a saída fácil de quem esbarra
no 42830. Foi o que `0021` (PROB-0011) limpou, sem nada impedir a volta. Ficaram as duas:
`[5/6]` a violação de isolamento (hoje 0 casos, 26 FKs compostas) e `[6/6]` a prontidão,
que é o que remove a tentação.

A query de `[6/6]` levou as duas correções previstas — `indnkeyatts` no lugar de
`indnatts`, `indisvalid AND indisready` — que o plano já apontava.

### 3. Eram dez tabelas, não nove — e a décima ficou de fora com justificativa

A lista de nove da auditoria foi levantada num banco onde `sync_outbox` não existia: o
mesmo drift descrito no ponto 6. Restaurados os objetos, a varredura acusa dez.

`sync_outbox` **não** entrou na `0036`. `drain_sync_outbox()` (`0008:83-92`) apaga TODAS
as linhas a cada pull, movendo-as para `sync_changes` — ser alvo de FK é impossível por
construção, não improvável; uma FK quebraria na primeira drenagem. O `id` é `bigserial`
só para ordenar a fila, e a identidade durável vive em `sync_changes`. O índice seria
custo puro de INSERT no caminho de escrita mais quente do sistema: trigger
`capture_sync_outbox()` em seis tabelas.

Ficou em `ISENTAS_DE_UNIQUE_TENANT_ID`, com o motivo por escrito, e a seção reprova
**isenção obsoleta** — se a tabela sumir ou ganhar o índice, a isenção vira problema.

### 4. Validação do sync em duas passadas, não movida em bloco

O plano mandava mover `validatePayload` para depois do SELECT, para ter a linha em mãos.
Feito assim, payload malformado passou a pagar uma ida ao banco, e a suíte cobria
exatamente isso (`expect(query).not.toHaveBeenCalled()`) — 20 testes quebraram.

Ficou: `validatePayload` antes do SELECT contra a lista base (campo desconhecido e campo
controlado pelo servidor morrem sem tocar no banco) e `assertCamposDaForma` depois, só
para campos válidos na entidade mas não **nesta forma** do registro. Fail-fast preservado
e a responsabilidade fica mais clara.

### 5. `errors.test.ts` já existia — e protegia o defeito

O plano mandava criar o arquivo. Ele existia, com o caso
`'mantém os textos fixos de 422/404/409'`, que fixava justamente o comportamento a
corrigir. Foi editado: 409 saiu do grupo de textos fixos e ganhou dois casos.

### 6. Drift no dev que a auditoria não viu

Destravado o `db:migrate`, o `db:verify` reprovou o banco de dev por cinco objetos de
sync ausentes com as migrations `0008`/`0009` marcadas como aplicadas — assinatura de
PROB-0059, já prevista no comentário de `0031`. Ambas são integralmente idempotentes
(conferido antes de rodar), então foram reaplicadas via `psql`, por decisão do usuário,
sem tocar em `schema_migrations`. Registrado como FIX-0002.

### 7. O ERASURE cobriu duas tabelas a mais

Ao classificar o inventário para o registro de PII, `inadimplencia.observacao` e
`notas_fiscais.observacao` apareceram como texto livre alcançável pelo titular — mesma
natureza de `pedidos.observacao`, que já era purgada. Declará-las "sem PII" seria embutir
o defeito do PROB-0075 no código escrito para corrigi-lo. Entraram por decisão do usuário.

`financeiro_movimentacao.descricao` ficou fora com justificativa: é texto livre, mas a
tabela não tem vínculo com titular algum — nenhuma solicitação a alcança.

E apareceu `parceiros_comerciais.nome_parceiro`: nome de pessoa física de um **terceiro**,
que não é `CLIENT` nem `USER` e portanto não tem tipo de titular nem caminho de
solicitação. Virou PROB-0076. Está em `TABELAS_SEM_PII` **com a ressalva escrita de que
não é isenção** — o oposto do silêncio que causou PROB-0075.

---

## Mudanças observáveis de contrato

1. **Push de sync rejeita o que aceitava.** Pedido de origem externa não aceita mais
   `status`, `total_sem_imposto` nem `total_com_imposto`, e só é editável em `em_aberto`.
   No v2 vira `status: 'rejected'`, `code: 'VALIDATION_FAILED'`, `retryable: false`.
   **`mobile/` não foi alterado nem validado.**
2. **Mensagens de erro do sync mudaram.** Campo controlado pelo servidor passou a ter
   frase própria, distinta de campo inexistente.
3. **409 no frontend mostra a mensagem do backend.** Antes, texto fixo.
4. **Campos da trilha de auditoria LGPD ficaram qualificados por tabela**
   (`clientes.razao_social`). A lista antiga do ramo CLIENT era só o nome da coluna, e
   `prazo` existe em `clientes` **e** em `pedidos` — a trilha não dizia qual fora purgada.
5. **`pedidos_origem_externa_check` passou a exigir
   `total_sem_imposto = total_com_imposto`** no ramo externo, `NOT VALID`.

---

## Verificação executada

```
npm run lint  --workspace=backend      → sem erros
npm run build --workspace=backend      → sem erros
npm test      --workspace=backend      → 50 suites, 500 passed, 1 skipped
npm test      --workspace=shared       → 9 passed
npm run lint  --workspace=frontend     → sem erros
npm run build --workspace=frontend     → built (aviso pré-existente de chunk > 500 kB)
npm test      --workspace=frontend     → 10 files, 58 passed
```

Banco descartável `renowa_fix`, provisionado **do zero**:
```
db:migrate → aplicou 0000…0037 sem erro
db:verify  → OK: schema íntegro. Nenhum drift encontrado.
smoke ERASURE contra PostgreSQL real → 7 tabelas purgadas, 7 provas SQL OK,
                                       nenhum CHECK nem NOT NULL violado
```

Banco de dev `renowa` (com dados):
```
antes:  19 migrations · 0032_produto_ipi_perc.sql · db:verify reprovando
depois: 24 migrations · 0037_lgpd_purga_e_totais_externos.sql · db:verify limpo
```

Evidência do portão de `[6/6]`: rodado **antes** da `0036`, reprovou as nove tabelas +
`ISENTA sync_outbox`; depois, `0 tabela(s) sem o índice, 1 isenta(s)`.

**Não executado, e por quê:**
- **Produção.** Sem acesso nesta sessão. Antes de tratar a `0037` como segura lá, rodar e
  registrar: `SELECT name, checksum FROM public.schema_migrations ORDER BY name DESC LIMIT 5;`,
  `SELECT count(*) FROM pedidos WHERE origem = 'externo';` e a contagem de externos com
  totais divergentes. Se a última for > 0, **pare**: a igualdade deixa de ser reescrita
  segura e vira decisão de negócio. Produção também pode ter o drift de sync do FIX-0002.
- **Fluxo pela UI** (BACKLOG-0049): manual, do usuário. Agora desbloqueado.
- **`mobile/`**: fora de escopo por `AGENTS.md`.
- **Testes de integração HTTP** (BACKLOG-0053): exigem `services: postgres` no CI e config
  Jest separada — `backend/jest.config.js` tem `rootDir: 'src'` e
  `testRegex: '.*\.spec\.ts$'`, então um teste com banco entraria na suíte hermética e a
  quebraria em qualquer máquina sem container.

---

## O que ficou aberto

- **PROB-0076** — PII de terceiro em `parceiros_comerciais` sem tipo de titular. Decisão
  de negócio antes de código.
- **PROB-0065** — sync ainda escreve `status` em pedido **interno**. O mecanismo
  (`writableFieldsFor`) já existe; falta decidir a transição de status para o sync, o que
  tem contraparte no cliente mobile.
- **BACKLOG-0054** — falta a spec do ERASURE contra banco real (o que existe é mock de
  `manager.query`) e a política de retenção: `pii_audit_events` cresce sem limite e não há
  `ScheduleModule` no backend.
- **BACKLOG-0049** — validação ponta a ponta pela UI.
- **BACKLOG-0053** — testes de integração HTTP.
- **BACKLOG-0051** — o critério de aceite precisa passar a exigir expurgo do objeto no
  bucket, tanto na purga LGPD quanto na cascata do soft delete. Hoje o registro zera
  `conteudo`/`storage_key` e nada apaga o remoto.
- **Verificação de produção**, acima.

---

## Risco introduzido

A allowlist de checksum afrouxa, por definição, a única proteção contra migration editada
depois de aplicada — a mesma que existe por causa de PROB-0059. Quatro casos de teste
limitam o dano: todo hash aceito precisa de fixture versionada que o produza, a fixture só
pode diferir do arquivo atual em linhas de controle de transação, nenhuma fixture fica
órfã e o runner segue sem enxergar `.superseded/`.

Entrada nova ali é exceção, não rotina. `AGENTS.md` passou a registrar que editar migration
aplicada — inclusive só um comentário — trava `db:migrate` em todo banco que já a aplicou.
