# ErrosAtuais — fila de correção

> Lista de trabalho pessoal, criada em 2026-07-31. Só o que está **realmente aberto**, conferido contra o código nesta data.
> Fonte: `BACKLOG.md` e `PROBLEM_LEDGER.md`. Mobile foi excluído do escopo.
> Ordem sugerida: do mais barato para o mais caro. Marque `[x]` conforme resolver.

---

## [ ] 1. Percentual de comissão aceita valor absurdo

**ID:** BACKLOG-0029 · **Área:** backend · **Prioridade:** P1

**O que está errado:** o campo de percentual de comissão não tem piso nem teto. Dá para informar `-1` e gerar comissão negativa entrando no fluxo de caixa, ou informar `9999`, que estoura a coluna `numeric(5,2)` do banco e devolve **erro 500** para o usuário em vez de um 400 explicando o que está errado.

**Onde:**
- `backend/src/finance/dto/commission-action.dto.ts:5-6` — hoje só tem `@IsDecimal`.

**Como resolver:**
1. Adicionar `@Min(0)` e `@Max(100)` no campo `perc_comissao`.
2. Atenção: o campo é `string` com `@IsDecimal`. `@Min`/`@Max` do class-validator só funcionam em número — usar `@Type(() => Number)` junto, ou trocar por validação equivalente que funcione no tipo atual.

**Como saber que acabou:** teste enviando `-1` e `9999` recebe **400**, não 500 nem sucesso.

---

## [ ] 2. "Liberar pedido" trava o pedido para sempre, sem perguntar nada

**ID:** BACKLOG-0022 · **Área:** frontend · **Prioridade:** P1

**O que está errado:** liberar um pedido é irreversível — trava a edição comercial e dos itens de vez. Mesmo assim o botão dispara a ação no primeiro clique, sem confirmação. Pior: os dois botões usam o ícone `Unlock` (cadeado **aberto**), que comunica exatamente o oposto do que a ação faz. Um clique errado, ou alguém interpretando o ícone como "destravar para editar", perde a capacidade de corrigir o pedido.

**Onde:**
- `frontend/src/pages/PedidoForm.tsx:259-260` — `onClick={handleLiberar}` direto, ícone `Unlock`.
- `frontend/src/pages/PedidoDetalhe.tsx:154-155` — mesma coisa.
- `frontend/src/lib/orderPermissions.ts` — `isPedidoLocked`, o efeito real da ação.

**Como resolver:**
1. Nos dois arquivos, colocar um modal de confirmação antes de chamar `handleLiberar()`, dizendo que a ação é irreversível e trava a edição.
2. Usar o `Dialog` do design system, **não** `window.confirm` (ver BACKLOG-0023, que quer justamente eliminar o `confirm` nativo).
3. Trocar o ícone `Unlock` por `Lock` ou `CheckCircle` nos dois lugares.

**Como saber que acabou:** clicar em "Liberar pedido" abre o modal; cancelar não altera nada; o ícone comunica "travar".

---

## [ ] 3. Comissão do faturamento nasce incompleta e some da tela

**ID:** BACKLOG-0025 · **Área:** backend / frontend · **Prioridade:** P1

**O que está errado:** dois defeitos que se somam.
1. Ao registrar a nota fiscal, a comissão é criada **sem** `numero_nfe` e **sem** `data_faturamento`. A coluna "NF-e" da tela de Financeiro mostra sempre "—".
2. A listagem e o resumo de comissões filtram por `data_pedido`, mas a tela abre no mês corrente. Faturar **hoje** um pedido de um mês anterior faz a comissão aparecer só no mês do pedido — o usuário abre a tela, não vê nada e conclui que o faturamento não gerou comissão.

> **Ressalva (conferido em 2026-07-31):** o registro antigo do BACKLOG dizia que "com a data nula, ela não aparece em mês nenhum". Isso é **falso** — `data_pedido: order.data` é preenchido na criação. O sintoma real é só o descasamento de mês descrito acima.

**Onde:**
- `backend/src/faturamento/faturamento.service.ts:193-208` — o `commissionRepo.create({...})` sem `numero_nfe`/`data_faturamento`.
- `backend/src/finance/finance.service.ts:305-312` (`findAllComissoes`) e `:338-341` (`getResumoComissoes`) — os filtros por `data_pedido`.

**Como resolver:**
1. Preencher `numero_nfe` (de `savedNota.numero_nota`) e `data_faturamento` na criação da comissão.
2. **Decidir antes:** a lista de comissões deve ser regida pela data do pedido ou pela data do faturamento? Trocar o filtro conforme a decisão.

**Como saber que acabou:** faturar um pedido de mês anterior e ver a comissão na tela, com a NF-e preenchida. Teste cobrindo esse caso.

---

## [ ] 4. Decidir de onde vem o número de "Faturamento" do Dashboard

**ID:** BACKLOG-0018 · **Área:** backend / produto · **Prioridade:** P1

**O que está errado:** não é bug de código — é uma decisão de negócio pendente. O KPI "Faturamento" vivia mostrando `R$ 0` porque lia de `financeiro_movimentacao` (lançamentos manuais tipo 'Venda', que o sistema nunca cria sozinho). A correção trocou a fonte para os **pedidos** reais não-cancelados, alinhando com "Evolução de Venda" e "Curva ABC". Só que ninguém confirmou que essa é a intenção do negócio.

**Onde:** nada a mexer até a decisão. Depois: `docs/SYSTEM_OVERVIEW.md` ou o service do dashboard.

**Como resolver:** escolher uma das duas:
- **"Faturamento = pedidos"** (o que está no ar hoje) → só documentar a decisão em `SYSTEM_OVERVIEW.md` e fechar.
- **"Faturamento = lançamento manual"** → reverter a correção e implementar a criação automática de um lançamento `financeiro_movimentacao` tipo 'Venda' ao fechar pedido. Escopo bem maior.

**Como saber que acabou:** a decisão está escrita em `SYSTEM_OVERVIEW.md`, para ninguém reverter por desconhecimento numa revisão futura.

---

## [ ] 5. SAC não registra quem abriu o chamado, e vendedor vê chamado dos outros

**ID:** PROB-0078 · **Área:** backend / segurança · **Prioridade:** P1 (hoje MEDIUM)

**O que está errado:** o chamado de SAC não guarda autoria — não há como saber quem abriu. E `findAll`/`findOne` do SAC não filtram por vendedor dono, diferente do que a rota de pedidos já faz. Hoje o estrago é limitado porque o perfil `vendedor` não tem `sac.ver`. **No dia em que alguém conceder essa permissão pela tela de perfis, vira vazamento entre vendedores — sem precisar de deploy nenhum.**

**Onde:**
- `backend/src/sac/` — controller já recebe `@CurrentUser()`, mas nada é feito com ele.
- Padrão a reusar: `backend/src/orders/order-ownership.ts` (`isVendorOnly`, `vendorOwnershipWhere`).

**Como resolver:**
1. Adicionar coluna de autoria no chamado (migration) e preencher no `create`.
2. Aplicar `vendorOwnershipWhere` em `findAll`/`findOne` do SAC, espelhando pedidos.

**Como saber que acabou:** vendedor A não enxerga chamado do vendedor B, com teste cobrindo. Retorno **404**, não 403 (mesmo padrão de pedidos, para não vazar existência).

---

## [ ] 6. Push de sync não sabe quem é o usuário

**ID:** BACKLOG-0078 · **Área:** backend / segurança · **Prioridade:** P1

**O que está errado:** o `SyncController.push` **já recebe** o usuário autenticado e o `SyncAuthorizationService` já calcula as permissões efetivas — mas na hora de chamar `pushItems(dto.items, user.tenantId)` os dois são descartados e só o tenant segue adiante. Resultado: um celular de vendedor consegue empurrar item no pedido de **outro** vendedor do mesmo tenant, coisa que a API REST recusa. Vale para todas as entidades do sync, não só pedido. É falha antiga, não regressão.

**Onde:**
- `backend/src/sync/sync.service.ts:349` — `pushItems(items, tenantId)`, assinatura sem ator.
- `backend/src/sync/sync-authorization.service.ts` — `assertCanPush` hoje devolve `void`.
- `backend/src/orders/order-ownership.ts` — `isVendorOnly`/`vendorOwnershipWhere` para reusar.

**Como resolver:**
1. `assertCanPush` devolver um `SyncActor { tenantId, sub, roles, permissions }` em vez de `void`.
2. Controller repassa o ator; `loadOrderForWrite` volta a recebê-lo e aplica `vendorOwnershipWhere`.
3. No CREATE de pedido pelo sync, forçar `vendedor_uuid = actor.sub`.

**Custo de teste conhecido:** uma asserção em `sync-authorization.service.spec.ts`, o argumento de `pushItems` em `sync.controller.spec.ts`, e os literais `'tenant-1'` de `sync.service.spec.ts` atrás de um helper.

**Como saber que acabou:** celular de vendedor recebe recusa terminal ao tocar pedido de outro vendedor, nos dois protocolos (v1 e v2), com teste.

---

## [ ] 7. NestJS 10 é fim de linha — 10 falhas HIGH sem conserto possível

**ID:** PROB-0068 + BACKLOG-0040 · **Área:** infra / segurança · **Prioridade:** P1 · **Precisa de data acordada**

**O que está errado:** o backend roda NestJS 10.4.22, a **última 10.x que vai existir**. `npm audit --omit=dev` devolve 20 achados, 10 deles HIGH. O advisory do próprio `@nestjs/core` só foi corrigido em 11.1.18+ — ou seja, **a linha 10 nunca vai receber a correção**. Mesma situação em `body-parser` e `qs`. Ir para produção assim é subir com 10 HIGH sem caminho de correção.

**Onde:**
- `backend/package.json:18-24` — `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express` em `^10.4.0`; `@nestjs/config` `^3.3.0`; `@nestjs/typeorm` `^10.0.2`.
- **A superfície completa da migração já foi levantada** (bumps obrigatórios, bloco `overrides` do `package.json` raiz a remover, `engines: node >= 20`, riscos em `user-throttler.guard.ts` / `main.ts` trust proxy / 4 controllers com `FileInterceptor`, e a lista do que foi verificado como **não aplicável**): ver `docs/BACKLOG.md:380-386`. Não duplicar aqui — ler de lá na hora de executar.

**Como resolver:** seguir a superfície levantada no BACKLOG-0040.

**Como saber que acabou:** backend em NestJS 11.1.28+, suíte verde nos três workspaces, `npm audit --omit=dev` sem HIGH atribuível à linha do NestJS.

> **Atenção:** a suíte atual **não certifica esta migração** — `@nestjs/testing` aparece em 1 de 59 specs, o resto usa mock manual, e não há teste HTTP nem Postgres no CI. Uma quebra de injeção de dependência ou do adapter Express passaria verde. A aceitação precisa incluir roteiro manual por `ops/qa-safari/`: login, cadeia de guards, throttling e os quatro endpoints de upload.

---

# Já resolvido no código — só confirmar e fechar o registro

Conferido contra o código em 2026-07-31. Estes estavam marcados como ABERTO no `BACKLOG.md` mas já foram entregues:

- **BACKLOG-0010** (era P0) — "editar itens de pedido depois de criado". **Existe:** `PUT /pedidos/:uuid` (`backend/src/orders/orders.controller.ts:69`) processa `dto.itens` com checagem de tenant (`orders.service.ts:306-311`), concorrência otimista via `VersionDto`, e há testes de ownership de vendedor e de bloqueio pós-liberação (`orders.service.spec.ts:231`).
- **BACKLOG-0021** — "trocar fornecedor apaga os itens". **Corrigido sob BACKLOG-0066:** `handleSupplierChange` (`frontend/src/pages/PedidoForm.tsx:165-172`) preserva as linhas, só desvincula o produto do fornecedor antigo e marca `precisa_produto`. Linha manual fica intacta.
- **BACKLOG-0035** — "`0007_optimistic_concurrency.sql` tem `BEGIN;`/`COMMIT;` próprios". **A correção do arquivo está feita:** ele abre com comentário explicando que o runner é quem envolve cada migration em transação, e nenhuma migration do projeto tem `BEGIN;`/`COMMIT;` próprios. Fica só o último critério de aceite — provisionar banco vazio do zero e ver `db:verify` limpo — que já é o escopo de BACKLOG-0039. Marcado como PARCIALMENTE_RESOLVIDO, sem trabalho próprio restante.
- **BACKLOG-0027** — "spec cross-tenant sem asserção para `NotaFiscal`/`Commission`". **Parcial:** `Commission` já está coberto (`cross-tenant-foreign-keys.spec.ts:37-38`). Falta só acrescentar a relação `NotaFiscal → pedido` ao array `tenantRelations` — a FK composta existe na entity (`nota-fiscal.entity.ts:21-22`). Escopo bem menor do que o registro sugere.
