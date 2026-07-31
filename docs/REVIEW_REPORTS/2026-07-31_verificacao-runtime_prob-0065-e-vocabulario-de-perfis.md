# Verificação em runtime — porta única de escrita de pedido e vocabulário de perfis — 2026-07-31

**Data:** 2026-07-31 · **Repo:** `renowa`, branch `master`
**Escopo:** provar contra banco e tela o que a suíte de mock não prova — o fechamento de PROB-0065 (push de sync deixou de ser segunda porta de escrita de pedido), PROB-0057 (vocabulário de perfis) e PROB-0061 (`db:verify` enxergando a infra de sync).
**Alvo:** ambiente **local** (`localhost:5173` + backend `3000` + Postgres `5433`, PostgreSQL 15.18), sessão `admin@renowa.local`.
**Motivo de existir:** as correções de FIX-0027 a FIX-0029 foram entregues com 669 testes verdes, **todos de mock**. Nenhuma linha de SQL nova tinha rodado contra Postgres, e nenhum pedido tinha sido criado pela tela depois da extração do `order-write.ts`. Suíte verde não é evidência de runtime.

---

## Parte 1 — Script contra o Postgres de dev (14/14)

Contexto do Nest levantado pelo mesmo caminho de `db:bootstrap`, serviços reais (`OrdersService`, `SyncService`), asserções contra o estado gravado. O pedido de teste foi removido no fim.

| Verificação | Evidência |
|---|---|
| REST cria pedido interno em `em_aberto` | `status=em_aberto`, `origem=interno` |
| Cabeçalho pela política de FIX-0023 | `283.60` / `301.96` |
| Item derivado no banco | `total_item 183.60`, `total_com_imposto 201.96`, `qtd_total 8.000`, `valor_com_desconto 22.95` |
| `status` recusado em pedido **interno** | `Campos controlados pelo servidor… status` |
| `total_item` recusado com instrução | `Campos derivados… Envie os insumos (…preco_unitario…)` |
| Recusa não grava nada | pedido seguiu `em_aberto` |
| Insumo aceito, servidor re-deriva | `qtd_caixas: 4` → item `367.20` / `403.92`, `qtd_total 16.000` |
| Cabeçalho recalculado na mesma transação | `467.20` / `503.92` |
| CREATE de item pelo sync | aceito |
| `ipi_perc` herdado do catálogo | produto com IPI 5% → `200.00` / `210.00` |
| Item em pedido `liberado` recusado | `status atual é 'liberado', e só 'em_aberto' aceita edição` + `ROLLBACK` |
| Recusa não mexeu no total | `667.20` intacto |
| `version` no UPDATE do v1 | cliente `1 → 2` |

Duas coisas que **só** o banco real prova, e provou, lidas no SQL emitido:

- o lock existe de fato — `… WHERE (("Order"."uuid" = $1) AND ("Order"."tenant_id" = $2)) … LIMIT 1 FOR UPDATE`;
- o UPDATE do v1 carrega `version = version + 1` (`UPDATE "clientes" SET "observacao" = $3, version = version + 1 …`).

## Parte 2 — Tela, via `ops/qa-safari`

Fases executadas na aba logada: `p0` (sessão), `p1`–`p4` (cadastros), `p5` (pedido com 2 itens), `p6` (pedido externo), `p7` (detalhe), `p7c` (liberar), `p8`/`p8b` (papel antes e depois), `p9` (faturamento), `p10` (SAC), `p11` (telas de edição), `p12` (varredura), `p14` (limpeza). Todas retornaram `ok:true`.

Os números que importam para este trabalho:

- **`p7`** — `183.60` / `201.96`: API, soma dos itens e tela concordam depois da extração do núcleo de cálculo.
- **`p8`** — PDF de 374 KB, 1 página, **2 imagens** embutidas; `p8b` idem depois de liberar.
- **`p12`** — 15 telas varridas, **zero erro**, incluindo `Config — usuários`, `Config — perfis` e `Config — auditoria`, que a correção de vocabulário de perfis (FIX-0028) tocou.
- **`p11`** — 6 telas de edição carregam valores existentes, inclusive pedido externo (13 campos) e SAC (10 campos).

Totais acumulados no `out/state.json`: **546 asserções verdadeiras**, 390 requisições registradas.

### Os 6 asserts falhos são meus, não do código

`state.json` acumula histórico e não zera entre fases. Os 6 falhos apontam para um pedido, um pedido externo e um chamado de SAC **soft-deleted em execução anterior** — rodei a sequência parcial e o driver reaproveitou ids mortos. Cada um tem gêmeo passando na mesma tela com registro vivo:

- `PDF (pedido) tem MIME de PDF` falha em `8432a336…` (excluído) e passa em `48595a59…` — e passou no próprio `8432a336…` **antes** de ele ser excluído;
- `Pedido externo — editar carregou valores existentes` falha em `9852af9c…` (excluído) e passa em `cce0149c…`;
- idem para o SAC.

A API devolver **404 para registro soft-deleted é o comportamento correto**; o que estava errado era o alvo.

### Armadilha de HMR ao adicionar export em `shared` (não é defeito de produto)

O driver capturou, durante a sessão:

```
[vite] Importing binding name 'formatRoleName' is not found.
[vite] Failed to reload /src/components/layout/Sidebar.tsx
ReferenceError: Can't find variable: formatRoleName @ /src/lib/authorization.ts?t=…
The above error occurred in the <Sidebar> component
```

**Causa:** aba aberta desde antes, com árvore de módulos anterior, mais dev server reiniciado — o HMR tentou aplicar update de `authorization.ts` sem o export novo (`formatRoleName`, adicionado a `@renowa/shared` em FIX-0028) no grafo. **Não é defeito vivo**, e a prova é empírica: depois de reload completo, `import('/src/lib/authorization.ts')` na página devolve `admin→Administrador`, `gestao→Gestão`, `equipe_vendas→Equipe Vendas`, `superadmin→Super administrador`. Build de produção e suítes sempre passaram.

Vale lembrar por quê o alias existe: `shared` compila para CommonJS (o backend Nest consome assim) e o `index.js` reexporta via `__exportStar`, padrão através do qual o Rollup **não** enxerga nomes — `import { formatRoleName } from '@renowa/shared'` quebrava o build de produção. `frontend/vite.config.ts` aponta `@renowa/shared` para a fonte TS. **Quem adicionar export ao `shared` precisa de reload completo da aba, não só HMR.**

## Parte 3 — Estado do banco depois da verificação

Conferindo o dev depois da limpeza do QA, apareceu um gap **anterior** a este trabalho: `SELECT count(*) FROM itens_pedido i JOIN pedidos p ON p.id = i.pedido_id WHERE i.deleted_at IS NULL AND p.deleted_at IS NOT NULL` → **81**. `OrdersService.remove` marcava só o pedido; o item ficava ativo, escondido apenas porque toda query o alcança pelo pedido. Corrigido em **FIX-0030** (cascata no molde do `SacService.remove`, depois do pai e na mesma transação) e saneado no dev por decisão do usuário: `UPDATE 81`, órfãos **81 → 0**, com os 5 itens ativos restantes todos sob pedidos vivos. `db:verify` seguiu `OK: schema íntegro`. Produção **não** foi inspecionada — BACKLOG-0080.

## Dano em dado de dev, registrado de propósito

O último caso do script escreveu `observacao = 'qa-prob-0065'` no cliente `1ebed758-86b2-4f44-80b5-f1cb9f82205c` **sem guardar o valor anterior**. Não é recuperável: `pii_audit_events` guarda só **nomes** de campo, e o único evento do cliente é o `CREATE` de 2026-07-21 — que lista `observacao` entre os campos, ou seja, havia conteúdo. O outbox de sync só tem o `NEW` da própria escrita. Por decisão do usuário o marcador ficou, em vez de `NULL`, que afirmaria "sem nota" sem base.

**Lição para o próximo script de verificação:** escrever em linha de cadastro existente exige capturar o valor anterior antes, ou usar registro criado pelo próprio script. O caso existia para provar o bump de `version` do v1 — e poderia ter usado o cliente que o `p4` cria.

## Conclusão

As três correções se sustentam fora do mock: a derivação e o recálculo acontecem no banco, os gates recusam o que devem recusar, o papel e os totais da tela concordam com a API, e as telas que o vocabulário de perfis tocou abrem sem erro. Nada do que falhou é atribuível às mudanças.

**O que continua não verificado:** produção, em tudo — `db:verify`, os órfãos de `itens_pedido` e as migrations `0038`/`0040`/`0041`/`0042` (BACKLOG-0041, 0062, 0076, 0080). E `mobile/`, que não foi alterado nem validado por decisão de escopo.
