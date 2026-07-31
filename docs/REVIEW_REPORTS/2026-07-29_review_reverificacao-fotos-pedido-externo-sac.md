# Reverificação independente das três frentes: fotos no pedido, pedido externo e SAC

**Data:** 2026-07-29 (parte 3) · **Repo:** `/Users/Zero/Projetos/renowa`, branch `master`
**Escopo:** `backend/`, `frontend/`, `docs/`. **`mobile/` não foi alterado nem validado** (`AGENTS.md:6-8`) — e é onde ficou o achado de paridade mais claro (PROB-0079).
**Nada foi commitado.** Tudo desta rodada segue no working tree; a árvore estava **limpa** no início da sessão.

Entrada: as três frentes já estavam implementadas
([...implementation...](2026-07-29_fullstack_implementation_fotos-pedido-externo-sac.md)),
auditadas ([...audit...](2026-07-29_audit_fotos-pedido-externo-sac.md)) e com as pendências
da auditoria fechadas ([...fix...](2026-07-29_fix_pendencias-auditoria.md)) — tudo isso
**commitado** (`f3ff896`, `1801f4f`, `52776a8`, `d3f85c8`, `9454356`, `59b8ea5`, `213ae87`,
`52ab571`). O pedido do usuário foi "verifique se está bom". Esta rodada é reverificação
independente: achou três defeitos que as três leituras anteriores não pegaram, e provocou
quatro decisões de negócio.

---

## Resultado

| Item | Antes | Depois |
|---|---|---|
| Miniaturas de foto em laço de requisição | defeito ativo, não visto | **FIX-0008** |
| Colisão de uuid virando 500 | defeito ativo, não visto | **FIX-0009** |
| Chamado SAC nascendo com `version = 2` | defeito ativo, não visto | **FIX-0010** |
| Teto de 10 fotos furável por concorrência | contagem fora da transação | **FIX-0011**, `FOR UPDATE` no pedido |
| Pedido externo duplicado | aceito sem trava | **FIX-0012**, índice único + 409 (decisão 3) |
| Numeração de SAC | sequence global, com buracos entre tenants | **FIX-0013**, 1,2,3 por tenant (decisão 2) |
| `?status=`/`?origem=` com valor fora do enum | 200 com lista vazia | **FIX-0014**, 400 |
| `data` do chamado aceitando `...T12:00:00Z` | podia gravar outro dia | **FIX-0015** |
| N+1 sob lock pessimista no `update` do SAC | 1 SELECT por item | **FIX-0016**, um `= ANY($1)` |
| Formulários sem guarda de permissão na rota | 4 rotas | **FIX-0017** |
| Fila de faturamento cega para origem | sem coluna | **FIX-0018**, `origem`/`sistema_origem`/`numero_pedido_externo` |
| Papel do SAC sem data de abertura; aba de PDF em branco | — | **FIX-0019** |
| Foto persistente sem TTL | requisito não cumprido, não registrado | **PROB-0077**, ressalva aceita (decisão 1) |
| Autoria do chamado SAC | inexistente, não registrado | **PROB-0078**, ABERTO |
| Paridade do mobile com pedido externo | ausente, sem item de backlog | **PROB-0079**, ABERTO |
| Comissão de pedido externo | grava `numero_pedido` interno | **PROB-0080**, ABERTO |
| Migrations | `0037` | **`0038`** (dev e descartável) |
| Testes | backend 500 · shared 9 · frontend 58 | backend **517** · shared **9** · frontend **60** |

Detalhe de cada correção com evidência: [BUGFIX_LOG.md](../BUGFIX_LOG.md), FIX-0008 a FIX-0019.

---

## Quatro decisões de negócio do usuário

Registradas como **decisão**, não como pendência.

### 1. A foto continua persistente no banco — ressalva aceita

O requisito original dizia que "a imagem não fica salva em nosso sistema". Não é o que o
sistema faz: a foto é `bytea` em `pedido_fotos.conteudo`, **sem TTL**, e nem o soft delete
da foto nem o do pedido apagam os bytes — o único caminho que zera o binário é o ERASURE
da LGPD (`backend/src/privacy/pii-registry.ts:89-106`, com `storage_backend = 'purgado'`).

O usuário decidiu **manter como está**. Fica registrado como ressalva explícita em
**PROB-0077**: requisito formalmente não cumprido por decisão, não bug. O que importa é
que esteja escrito — para não voltar como surpresa numa auditoria de privacidade nem numa
conversa sobre volume de banco ([BACKLOG-0051](../BACKLOG.md)).

### 2. Numeração de SAC passa a ser sequencial por tenant

Era `sac_numero_seq`, sequence **global**: o tenant A enxergava #1, #4, #9, e os buracos
revelavam o volume de chamados dos outros tenants. Decisão: 1, 2, 3 por tenant, sem buracos.
Implementado como tabela de contador com UPSERT atômico (FIX-0013), não como sequence por
tenant (exigiria DDL dinâmico a cada tenant novo) nem `MAX+1` (corrida clássica).

**Chamados existentes não são renumerados** — número já emitido pode estar impresso no papel
do chamado, e reescrever histórico para fechar buraco é pior que o buraco. O contador é
semeado no `MAX(numero_chamado)` de cada tenant, então a numeração contínua vale dos
chamados novos em diante.

### 3. Pedido externo duplicado passa a ser bloqueado

Índice único parcial + 409 com mensagem de negócio (FIX-0012). A chave é
**(tenant, fornecedor, número)** e **não** (tenant, sistema, número): `sistema_origem` é
texto livre digitado pelo operador ("SAP B1" / "SapB1" / "sap b1") e como chave deixaria
passar exatamente a duplicata que se quer barrar. O mesmo número em fornecedores distintos
é legítimo.

### 4. O rótulo do papel do SAC continua `FORNECEDOR`

Não vira "IMPORTADOR". O vocabulário de negócio chama de importador, mas a entidade é o
fornecedor cadastrado e o papel impresso segue o rótulo do sistema.

---

## Os três defeitos que três leituras anteriores não pegaram

### BUG A (alta) — laço infinito de requisições nas miniaturas de foto

`frontend/src/components/orders/OrderPhotosPanel.tsx`: o efeito das miniaturas tinha
`thumbs` nas dependências e derivava os pendentes de `thumbs`. `setThumbs` sempre devolve
um objeto novo, então cada rodada re-renderizava e re-disparava o efeito. Para a foto que
**baixa com sucesso** isso converge (ela sai de `pendentes`). Para a foto cujo download
**falha** — 404 de foto purgada pela LGPD, timeout, rede ruim — não converge nunca: ela
permanece pendente e o efeito refaz a requisição indefinidamente.

Agravante: `GET /pedidos/:uuid/fotos/:fotoUuid/conteudo` **não tem `@Throttle`**
(`backend/src/orders/order-photos.controller.ts:51` — o `@Throttle` da linha 26 é do
upload). Uma aba aberta com uma foto quebrada martela o endpoint que serve binário.

Por que as leituras anteriores passaram por cima: no caminho felizes o laço não aparece.
Só um teste que force a falha do download e deixe o event loop girar o revela.

**Provado antes de corrigir:** o teste novo conta **32 requisições em 5 voltas do event
loop** sem o fix e **1** com o fix.

Correção: `useRef<Set<string>>` com os uuids já buscados (com ou sem sucesso), fora do
ciclo de render, mais um `thumbsRef` espelhando `thumbs` para que uma **recarga explícita**
possa retentar o que falhou sem refazer o download do que já está em cache.

### BUG B (média) — colisão de uuid virava 500

`SacService.create` e `OrdersService.create`/`createExternal` recebem o uuid **gerado no
cliente** e não tinham a guarda que o `update` já tinha. Duplo clique em "Salvar" ou retry
de rede reenvia o mesmo uuid: o INSERT morre no índice único, `23505` sobe cru e o usuário
recebe **500** — erro de banco vazando como falha do servidor — em vez de uma recusa de
negócio.

Corrigido em **dois níveis**, de propósito:
- rede de segurança no `GlobalExceptionFilter`, mapeando `unique_violation` para **409
  `CONFLICT`** com mensagem genérica (nome de constraint e valores ficam no log, não na
  resposta). Checa por **forma** (`driverError.code` ou `code` === `'23505'`) e não por
  `instanceof QueryFailedError`: o mesmo erro chega embrulhado ou cru dependendo de quem
  executou a query, e a forma sobrevive a troca de versão do TypeORM;
- guardas de aplicação `assertUuidLivre` (pedidos) e `assertUuidsLivres` (SAC — chamado e
  itens, os itens em **uma** query em lote), que dão a mensagem de negócio.

### BUG C (baixa) — chamado nascia com `version = 2`

`SacService.create` salvava o cabeçalho **duas vezes**: uma para obter o `id`, outra para
gravar o total depois de construir os itens. Todo chamado recém-criado nascia com
`version = 2`, o que embaralha o controle de concorrência otimista desde o primeiro
carregamento. Corrigido calculando os itens **antes** do primeiro `save`, com o total já no
`create` — `buildItem` só precisa do `chamado_id` para a FK, então o total é conhecível
antes.

---

## Migration `0038`

`backend/src/database/migrations/0038_pedido_externo_unico_e_sac_por_tenant.sql`, aditiva e
idempotente, com o raciocínio inteiro no cabeçalho do arquivo:

- índice único parcial `uq_pedidos_externo_numero (tenant_id, fornecedor_id,
  numero_pedido_externo) WHERE origem = 'externo' AND deleted_at IS NULL`. Parcial pelos
  dois predicados: `origem` porque pedido interno tem o número NULL por CHECK (`0033`) e
  NULLs não colidem — mas o predicado deixa a intenção explícita; `deleted_at IS NULL`
  porque pedido excluído não deve reservar o número para sempre, e corrigir lançamento
  errado é excluir e refazer. Mesmo padrão de `uq_chamados_sac_tenant_numero_active`
  (`0035`);
- tabela `sac_numero_contador (tenant_id PK, ultimo, updated_at)`, com CHECK `ultimo >= 0`,
  trigger `set_updated_at` e backfill do `MAX(numero_chamado)` por tenant (**inclusive
  soft-deleted** — número de chamado excluído não volta a circular). `tenant_id` como
  PRIMARY KEY já satisfaz o invariante `UNIQUE(tenant_id, id)` verificado em `db:verify`
  `[6/6]`: é um contador, não tem identidade além do tenant, e por isso não tem `id` nem
  soft delete;
- `sac_numero_seq` **fica no banco, sem uso**. Dropar sequence é irreversível e não traz
  benefício; deixá-la também mantém `db:migrate` reaplicável em banco que já passou pela
  `0035`.

`verify-schema.ts` ganhou as três entradas correspondentes (tabela esperada, CHECK novo,
índice único parcial novo) — sem isso a `0038` seria invisível para o verificador.

---

## Mudanças observáveis de contrato

1. **Pedido externo duplicado passa a ser recusado** com **409**, citando o número do
   pedido que já usa aquele número de origem naquele fornecedor. Antes era aceito.
2. **Números de chamado SAC deixam de vir da sequence global.** Chamados **novos** seguem
   1, 2, 3 por tenant; os existentes mantêm o número que já tinham.
3. **`GET /pedidos?status=`/`?origem=` e `GET /sac?status=` respondem 400** para valor fora
   do enum. Antes: **200 com lista vazia** — indistinguível de "não há registros", e um
   front com typo falhava em silêncio.
4. **`data` do DTO de SAC exige `YYYY-MM-DD`.** `@IsDateString` sozinho aceitava
   `...T12:00:00Z`, e o Postgres truncava a hora convertendo por fuso: dependendo do
   horário, o dia gravado saía **diferente do informado**. Apertado **só no SAC**, que não
   trafega no sync; o DTO de pedido segue com `@IsDateString` **de propósito**, para não
   mudar o contrato do sync ([BACKLOG-0060](../BACKLOG.md)).
5. **Colisão de uuid responde 409, não 500.** Vale para qualquer `unique_violation` que
   escape de uma guarda de aplicação, não só as três rotas corrigidas.
6. **Fila de faturamento passa a expor `origem`, `sistema_origem` e
   `numero_pedido_externo`**, com coluna "Origem" na tela. Em pedido externo o valor é
   **declarado** pelo operador, não somado de itens — isso muda o que a divergência contra
   a nota significa, e quem confere precisa saber.
7. **Rotas de formulário passam a exigir permissão no frontend:** `/sac/novo` → `sac.criar`,
   `/sac/:uuid/editar` → `sac.editar`, `/pedidos/novo` e `/pedidos/externo/novo` →
   `pedidos.criar`, os `editar` → `pedidos.editar`. Antes, quem só tinha `ver` preenchia a
   tela inteira e descobria a recusa ao salvar. `/pedidos/externo` sem sufixo passou a
   **redirecionar** para `/pedidos`: casava com `:uuid` e virava erro de API em vez de rota
   inexistente.

---

## Duas correções que só apareciam sob concorrência

- **Teto de 10 fotos por pedido era furável.** A contagem rodava **fora** da transação da
  gravação: duas abas (ou dois cliques) passavam pelo mesmo `existentes` e as duas
  gravavam. Passou a contar e gravar na **mesma** transação, com
  `SELECT id FROM pedidos WHERE id = $1 FOR UPDATE`. O lock é na linha do **pedido**, não
  em `pedido_fotos`, então serializa apenas os uploads do mesmo pedido. Não existe CHECK
  para "no máximo 10 filhos" — o lock é a única trava possível no banco.
- **N+1 sob lock pessimista em `SacService.update`.** Era um SELECT por item, dentro da
  transação que já mantém `pessimistic_write` no chamado: 50 itens viravam 50 idas ao banco
  com o lock aberto. Virou um `SELECT ... WHERE uuid = ANY($1)`.

---

## Duas melhorias de papel impresso

- **`SacTicketPdf` ganhou a linha `DATA DE ABERTURA`.** O único carimbo temporal do papel
  era a data da **impressão**, no rodapé — o papel do atendimento não registrava quando o
  chamado foi aberto. A formatação é feita a partir da string `YYYY-MM-DD` sem passar por
  `new Date()`: `new Date('2026-07-29')` é lido como UTC e viraria dia 28 em qualquer fuso
  negativo, que é o do Brasil inteiro.
- **A aba do PDF (SAC e pedido) recebe um aviso "Gerando…"** em vez de ficar em branco.
  Ela continua sendo aberta **antes** do `await`, e isso é **deliberado**: depois de um
  `await` o navegador já não trata a chamada como resposta ao clique e o bloqueador de
  popup mata a janela. O que se corrigiu foi a aba em branco durante a montagem, que com
  fotos leva um download por imagem.

---

## Verificação executada

```
npm run lint  --workspace=backend    → limpo
npm run build --workspace=backend    → limpo
npm test      --workspace=backend    → 50 suites, 517 passed, 1 skipped (era 500)
npm test      --workspace=shared     → 9 passed
npm run lint  --workspace=frontend   → limpo
npm run build --workspace=frontend   → built (aviso pré-existente de chunk > 500 kB)
npm test      --workspace=frontend   → 11 arquivos, 60 passed (era 58)
```

Banco descartável `renowa_verify38`, criado do zero e depois **descartado**:
```
db:migrate → aplicou 0000…0038 sem erro
db:verify  → OK — 28/28 tabelas, 34/34 CHECKs, 7/7 índices únicos parciais,
             22/22 triggers de updated_at, 0 FK sem isolamento,
             0 tabela sem UNIQUE(tenant_id,id) + 1 isenta
```

Smoke SQL no descartável, contra PostgreSQL real:
1. primeiro pedido externo entra;
2. mesmo número no **mesmo** fornecedor é recusado por `uq_pedidos_externo_numero`;
3. mesmo número em **outro** fornecedor entra;
4. soft delete **libera** o número;
5. contador dá `tenantA=1`, `tenantA=2`, `tenantB=1` — numeração por tenant provada;
6. `ultimo = -1` recusado pelo CHECK.

Concorrência do contador: **50 emissões paralelas** (`xargs -P 10`) do mesmo tenant →
**50 números distintos, nenhum erro, nenhum deadlock**.

Banco de dev `renowa`:
```
antes:  0037
depois: 0038 · db:verify limpo
```
A `0038` aplicou sem risco porque o dev tinha **0 pedido externo** e **0 chamado SAC**,
logo nenhuma duplicata para o índice único barrar.

**Não executado, e por quê:**
- **Produção.** Nunca verificada contra `0037` nem `0038`. O checklist de `0037` está em
  [2026-07-29_fix_pendencias-auditoria.md:184-189](2026-07-29_fix_pendencias-auditoria.md).
  Para a `0038`, conferir **antes** de aplicar:
  ```sql
  SELECT tenant_id, fornecedor_id, numero_pedido_externo, count(*)
    FROM pedidos WHERE origem = 'externo' AND deleted_at IS NULL
   GROUP BY 1, 2, 3 HAVING count(*) > 1;
  ```
  Se voltar linha, o `CREATE UNIQUE INDEX` **falha e a migration para** — comportamento
  desejado, porque a resolução é decisão de negócio, não de schema. Ver
  [BACKLOG-0062](../BACKLOG.md).
- **Fluxo pela UI** ([BACKLOG-0049](../BACKLOG.md)): manual, do usuário. Agora com o dev
  em `0038`.
- **`mobile/`**: fora de escopo por `AGENTS.md` — e é justamente onde está PROB-0079.
- **Testes de integração HTTP** ([BACKLOG-0053](../BACKLOG.md)): seguem inexistentes para
  as rotas novas; a dependência de `services: postgres` no CI continua valendo.

---

## O que ficou aberto

- **PROB-0077** — foto persistente sem TTL. Ressalva **aceita** pelo usuário (decisão 1);
  nada pendente, mas precisa ficar escrito.
- **PROB-0078** — chamado SAC **sem autoria** (`created_by`/`usuario_id`) e `findAll`/
  `findOne` do SAC **sem escopo de ownership de vendedor**. Latente hoje porque `vendedor`
  não tem `sac.*` ([BACKLOG-0050](../BACKLOG.md)); no momento em que `sac.ver` for
  concedido pela tela de Perfis — o que **não exige código** — todo vendedor passa a ver os
  chamados de todos. Adicionar autoria é **escopo novo**: aguarda decisão do usuário.
- **PROB-0079** — `mobile/` fora de paridade com pedido externo. Nenhum item de backlog
  cobria isso.
- **PROB-0080** — comissão de pedido externo grava o `numero_pedido` **interno**
  (`faturamento.service.ts:200`), então não reconcilia com o sistema de origem na tela de
  financeiro.
- **BACKLOG-0058** — painel de fotos não aparece no **formulário** de pedido externo, só no
  detalhe; inconsistência com o pedido interno.
- **BACKLOG-0059** — `SacTicketPdf` duplica o `StyleSheet` de `OrderValidationPdf`:
  mudança de identidade visual precisa ser feita duas vezes.
- **BACKLOG-0060** — `@IsDateString` do DTO de **pedido** segue aceitando datetime. **Não**
  apertado de propósito, por causa do contrato de sync.
- **BACKLOG-0061** — zero teste de tela para as três frentes. O teste novo de
  `OrderPhotosPanel` é o primeiro.
- **BACKLOG-0062** — gate de produção da `0038`, com a query de pré-checagem acima.
- **BACKLOG-0049** e **BACKLOG-0053** seguem abertos.

---

## Risco introduzido

O mapeamento de `23505` para 409 no filtro global vale para **todo** o backend, não só para
as três rotas corrigidas. Consequência: uma violação de unicidade que hoje seria um bug
real de aplicação passa a sair como 409 de negócio, com mensagem genérica, em vez de 500
ruidoso. O log guarda a mensagem original e o stack, então a informação não se perde — mas
o sinal fica mais quieto. A mitigação é que as guardas de aplicação (`assertUuidLivre`,
`assertUuidsLivres`, `assertNumeroExternoLivre`) existem justamente para que o filtro seja
rede de segurança, não caminho normal.

O índice único de pedido externo é a única mudança desta rodada capaz de **abortar uma
migration** em ambiente com dados. É intencional, e o pré-check está registrado em
BACKLOG-0062.

---

## Correção de drift na documentação

`docs/SYSTEM_OVERVIEW.md` afirmava, nas duas primeiras notas de atualização, "Nada foi
commitado — tudo segue no working tree". **Falso:** aquele trabalho está commitado
(`f3ff896`, `1801f4f`, `52776a8`, `d3f85c8`, `9454356`, `59b8ea5`, `213ae87`, `52ab571`) e a
árvore estava limpa no início desta sessão. Corrigido no arquivo. É a **segunda** vez que
esse drift acontece — a nota de 2026-07-22 (parte 4) já tinha corrigido o mesmo tipo de
afirmação. Vale como regra: estado de commit é fato que envelhece em minutos e só deve ser
escrito com a data e o `sha` ao lado.
