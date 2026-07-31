# Foto na linha do item no papel, e as correções da rodada de teste — 2026-07-30

**Data:** 2026-07-30 · **Repo:** `renowa`, branch `master`
**Escopo:** (A) desbloquear os filtros de lista que respondiam 400; (B) mudar o papel do pedido para imprimir uma foto por linha de item, escolhida e persistida; (C) fechar os achados menores da rodada de teste de 2026-07-29.
**Nada foi commitado.** Tudo no working tree, junto do que já estava da parte 3.

**Estado de entrada:** o relatório [2026-07-29_teste-automatizado-safari.md](2026-07-29_teste-automatizado-safari.md) deixou quatro achados, um deles BLOCKER, e o usuário pediu por cima uma mudança de produto no papel.

---

## Cinco decisões do usuário

1. **Uma foto por linha de item**, com o código do item impresso acima da imagem. A escolha é persistida no banco e vale para toda emissão futura — o papel é reemitido a cada mudança de status.
2. **A coluna FOTO é a primeira** da tabela de itens, antes de ITEM.
3. **Item sem foto marcada cai na foto vinculada mais antiga.** Marcar serve para *trocar*, não para *habilitar*: o papel tem de ser útil na primeira emissão, e todo pedido já existente nasce sem marcação.
4. **Pedido externo mantém a seção "Fotos" em página separada.** O papel do externo não tem tabela de itens — o valor é informado direto —, então não existe linha onde encaixar a foto. Sem essa exceção, foto de pedido externo desapareceria do papel.
5. **Entra vínculo manual foto→item na tela.** O vínculo automático só acerta em match único de nome de arquivo, e não havia UI: sem isso, foto cujo nome não casou ficaria órfã para sempre e — com o papel imprimindo só fotos de item — invisível para sempre. Foi a única expansão de escopo, e ela é o que impede a feature de nascer com furo.

---

## Parte A — filtros de lista (PROB-0081, FIX-0020)

`ListOrdersQueryDto` e `ListSacQueryDto`, ambos `extends PaginationDto`, com `@IsIn` contra `ORDER_STATUSES`, `ORDER_ORIGENS` e `SAC_STATUSES`. Os `@Query('x')` soltos saíram dos dois controllers, junto do `@Query('search')` que lia duas vezes um campo já vindo do DTO. A checagem de enum ficou nos services como defesa em profundidade — o mobile/sync não passa por estes DTOs.

**A guarda de regressão é a asserção de mensagem, não o 400.** Foi o 400 do whitelist que fez os testes do roteiro passarem por motivo errado. Além dos casos de mensagem nas specs dos dois services, entrou um spec de arquitetura, `backend/src/common/architecture/query-filter-whitelist.spec.ts`, que varre **todos** os controllers e reprova `@Query('campo')` que não seja propriedade validada do DTO do `@Query()` sem chave.

Ele nasceu estrito demais: a primeira versão reprovava qualquer mistura de `@Query()` com `@Query('campo')` e acusou `clients`, `suppliers` e `transport`, que usam `@Query('search')` — campo **que existe** no `PaginationDto`, portanto leitura redundante e não defeito. A regra foi apertada no invariante real (o campo tem de estar declarado no DTO), que é exatamente a diferença entre `search` funcionar e `origem` não.

O spec também **prova que dispara**: um caso monta um controller com o defeito e exige a violação correspondente. Sem isso, ele poderia estar cego — o mesmo problema que ele existe para impedir.

## Parte B — foto escolhida por item (BACKLOG-0063)

**Migration `0039_pedido_foto_no_papel.sql`** — coluna `usar_no_papel boolean NOT NULL DEFAULT false`, mais duas travas:

- CHECK `NOT (usar_no_papel AND item_pedido_id IS NULL)`. Necessário **além** da regra de aplicação porque NULL não colide em índice único: sem ele, N fotos soltas do mesmo pedido poderiam ficar marcadas e o índice abaixo não veria problema.
- Índice único parcial `uq_pedido_fotos_papel_item (tenant_id, item_pedido_id) WHERE usar_no_papel AND deleted_at IS NULL`. Parcial pelos dois motivos de `0038` e de `uq_chamados_sac_tenant_numero_active` (`0035`): só as marcadas concorrem, e soft delete não reserva a vaga do item para sempre.

Ambos registrados em `verify-schema.ts` (`CHECKS_ESPERADOS`, `INDICES_PARCIAIS_ESPERADOS`) — sem registro o script não conhece os objetos e isso conta como drift.

**Backend** — `setPaperPhoto` limpa a marca das irmãs do mesmo item e marca a escolhida na **mesma transação**, com a linha do pedido travada em `FOR UPDATE`, no padrão que `upload` já usava; a marcação final passa por `optimisticUpdate`, então o 409 sai pelo caminho já existente. `setPhotoItem` faz o vínculo manual e **sempre zera `usar_no_papel`** ao trocar de item ou desvincular: mover uma marcada para item que já tem a sua violaria o índice, e desvincular uma marcada violaria o CHECK. A escolha é do item, não da foto, e por isso não viaja com ela.

Ambas as rotas recusam pedido fora de `em_aberto`, com a mesma justificativa do `upload`: mudam o documento impresso, e pedido liberado já foi conferido em cima do papel emitido. Pedido antigo não fica sem foto por causa disso — o fallback na mais antiga cobre.

**Frontend** — a seleção mora em `frontend/src/lib/orderPaperPhotos.ts`, fora do componente de PDF, porque **quem emite usa a mesma função para decidir o que baixar**: se as duas decisões divergirem, o papel pede foto que ninguém baixou. A emissão passou a baixar uma foto por item em vez de todas.

Larguras da tabela de itens redistribuídas para abrir 11% à coluna FOTO e levar CÓDIGO de 7% para 10% (FIX-0021). Somam exatamente 100%, e a folga saiu das colunas numéricas.

## Parte C — achados menores

- **FIX-0022** — miniatura passou a mostrar "Indisponível" com "Tentar de novo" (PROB-0082). As falhas viraram **estado**, não ref: sem re-render a tela continua mentindo. A guarda contra o laço do FIX-0008 permanece intacta — a repetição é sob ação explícita.
- **FIX-0021** — código transbordando, resolvido junto da redistribuição.
- **BACKLOG-0064** — DELETE de pedido liberado devolve 204, não 409. Código **não** foi tocado: é pergunta de regra. A afirmação errada do roteiro está corrigida no relatório da rodada.
- **Achado extra**: o `<select>` de Status em `/pedidos` não tinha `aria-label`, ao contrário do de Origem — o teste de UI tropeçou nisso. Corrigido no mesmo filtro que a rodada estava consertando.

---

## Verificação executada

**Estático.** `npm run build --workspace=backend` limpo. `npm test --workspace=backend` → **553 passed, 1 skipped** (51 suítes; eram 517 antes desta rodada). `npm run lint --workspace=backend` limpo. `npm run build`, `lint` e `test --workspace=frontend` → **72 passed** (eram 60).

**Banco.** `db:migrate` aplicou a `0039`; `db:verify` → "schema íntegro", com CHECKs 35/35 e índices parciais 8/8 reconhecendo os objetos novos.

As três invariantes de banco foram exercitadas com SQL direto, em transação revertida — a suíte automatizada não prova invariante de banco:

| Tentativa | Resultado |
|---|---|
| duas fotos marcadas no mesmo item | `duplicate key value violates unique constraint "uq_pedido_fotos_papel_item"` |
| foto marcada sem item | `violates check constraint "pedido_fotos_papel_item_check"` |
| foto marcada excluída + outra marcada no mesmo item | aceito — soft delete libera a vaga |

**Runtime, na aba logada do Safari.** Pedido de teste com 2 itens, 2 fotos vinculadas por nome e 1 solta.

- Bloco de filtros: **9/9**. `origem=externo` → 200 com `total=1` e toda linha `origem: "externo"`; enum inválido → 400 **com a mensagem do enum**; `?xpto=1` → 400 `property xpto should not exist`, provando que o whitelist não foi afrouxado.
- Bloco do papel: **13/13**. Nenhuma foto nasce marcada; marcar a 2ª do item deixa exatamente uma; marcar outra do mesmo item **troca**; marcar de outro item não desmarca a do primeiro; foto solta → 400; versão velha → 409; mover marcada zera a marca; foto solta pode ser vinculada; desvincular zera a marca; **duas marcações simultâneas da mesma linha devolveram 200/409 e deixaram uma só marcada**; pedido liberado → 409.
- Bloco de tela: filtros de `/pedidos` (Origem e Status) e `/sac` (Status) listam sem "Ocorreu um erro".
- **Papel gerado de verdade**, capturado da aba e conferido com `pdftotext -layout` e render em imagem: FOTO como primeira coluna, código acima da imagem, uma foto por linha, `PAPEL-A-3277` inteiro na coluna CÓDIGO, **1 página** — nenhuma página extra de fotos —, foto solta ausente. **2 downloads de conteúdo, não 4.** Os dois caminhos ficaram cobertos: um item imprimiu a foto **marcada**, o outro caiu no **fallback**.
- **Papel do pedido externo**: 2 páginas, seção "Fotos" na página 2, sem tabela de itens, "Valor do pedido" como total único.
- Dados de teste removidos no fim (dois pedidos, `DELETE 204`).

---

## O que ficou aberto

- **`usePaginatedQuery` descarta a mensagem da API** em favor de "Ocorreu um erro" em todas as listas. É o que tornou PROB-0081 ilegível na tela. Não tocado.
- **BACKLOG-0064** — regra de exclusão de pedido liberado/faturado, decisão do usuário.
- **PROB-0080** — comissão de pedido externo, intocada nesta rodada.
- **Papel do SAC** segue sem verificação em runtime, e continua duplicando o `StyleSheet` de `OrderValidationPdf` (BACKLOG-0059): a redistribuição de larguras feita aqui **não** o alcançou.
- **Isolamento entre tenants** não foi exercitado em runtime — a sessão é de um tenant só.

## Risco introduzido

- **Papel mais longo.** Cada linha de item passa de ~23pt para ~56pt de altura. Pedido com muitos itens ganha páginas. Foi decisão explícita, mas o roteiro de 70 itens da MetaRenowa P0 não foi reexecutado com a coluna nova.
- **Mudança de mensagem de erro** nas listas: valor fora do enum passa a nomear os valores aceitos. Aditiva para quem lê o texto; quebra qualquer cliente que casasse a string antiga.
- **Pedido fora de `em_aberto` não aceita mais mudar a foto do papel nem revincular.** Escolha deliberada, alinhada ao `upload`, mas é restrição nova sobre `pedido_fotos`, que antes só barrava upload — `remove` continua sem guarda de status.
