# 2026-07-30 — Arredondamento do valor com imposto e troca de fornecedor no pedido

Registro de duas correções implementadas e verdes nesta data, ambas fechando pendências de **decisão do usuário** levantadas pela rodada de teste automatizado de tela ([2026-07-30_teste-automatizado-safari-todas-as-telas.md](2026-07-30_teste-automatizado-safari-todas-as-telas.md)).

- **Status final:** **PASS** (atualizado em 2026-07-30, depois da verificação em runtime)
- **Histórico do veredito:** este relatório fechou primeiro como `PASS_COM_RESSALVA`, porque as duas mudanças estavam provadas **só por teste automatizado**. A verificação em runtime foi executada em seguida, na mesma data, com app subido e sessão real (§7). Ela **confirmou** as duas mudanças nas três camadas e **corrigiu um achado deste relatório**: o residual do papel descrito em §4 era maior do que a realidade.

## 1. Objetivo

Fechar BACKLOG-0065 (onde arredondar o valor com imposto) e BACKLOG-0066 (troca de fornecedor descartando os itens do pedido), aplicando as opções escolhidas pelo usuário, e registrar o que ficou pendente.

## 2. Escopo

**Dentro:** cálculo do item de pedido (backend e prévia da tela), fixture de teste compartilhada, relatório SQL de auditoria de divergências, formulário de pedido (`PedidoForm`).

**Fora:** `mobile/` (fora de escopo por `AGENTS.md`); caminho de push de sync ([PROB-0065](../PROBLEM_LEDGER.md), não tocado); cálculo do SAC; regravação de pedidos históricos; layout do papel além do que a mudança de fórmula exigiria (nada exigiu).

## 3. Decisões do usuário aplicadas

| Item | Opções que estavam na mesa | Escolhida |
|---|---|---|
| BACKLOG-0065 | (a) manter arredondamento no unitário e o papel imprimir o IPI como diferença entre totais; (b) arredondar só no total da linha, unitário em precisão cheia | **(b)** |
| BACKLOG-0066 | critério principal: pedir confirmação antes de descartar; **alternativa**: preservar as linhas e desvincular o produto | **alternativa**, e **sem** diálogo de confirmação — a operação deixou de ser destrutiva |

## 4. BACKLOG-0065 — arredondamento no total da linha

### O que mudou

- `backend/src/orders/order-calculation.ts` (`calculateOrderItem`): `discountedRaw`/`taxedRaw` passam a ficar em **precisão cheia**; `money()` só entra em `totalWithoutTax`/`totalWithTax`. `valor_com_desconto` e `valor_com_imposto` estão declarados no código como **campos de leitura** (exibição e persistência), nunca reusados na aritmética. `calculateOrderTotals` **não mudou** — segue somando linhas já arredondadas, que é o que o papel imprime.
- `frontend/src/lib/orderCalculation.ts` (`previewItem`): espelha o backend. **Além disso** passou a normalizar a **entrada** como o backend já fazia (quantidades a 3 casas, preço e percentuais a 2) — antes não normalizava, e essa era uma divergência FE/BE **real** que nenhum teste cobria. `ItemInput` ficou opcional/nullable em todos os campos.
- `backend/src/database/audits/order_calculation_divergences.sql`: passou a usar `i.qtd_total` (persistida, já a 3 casas) em vez de `qtd_caixas * qtd_unitaria`, e `ROUND(...)` **por linha** em vez de arredondar só a soma. A fórmula já era a da política nova.
- **Novo:** `shared/src/orders/calculation-cases.ts` (`ORDER_ITEM_CASES`, `ORDER_TOTALS_CASES`), exportada em `shared/src/index.ts`, no mesmo molde de `shared/src/sac/calculation-cases.ts` do BACKLOG-0057. `backend/src/orders/order-calculation.spec.ts` (Jest) e `frontend/src/lib/orderCalculation.test.ts` (Vitest) **iteram** a fixture.

### Por que a fixture importa aqui

Antes eram **um** caso de cada lado, copiados à mão, e **nenhum dos dois distinguia "arredonda no unitário" de "arredonda no total da linha"**. A política podia divergir entre tela e servidor sem que nada acusasse — foi exatamente assim que a divergência de normalização de entrada sobreviveu. A fixture põe o caso uma vez e ele vale para os dois runners; divergência de comportamento quebra um deles.

### Números fixados por teste

| Grandeza | Antes | Agora |
|---|---|---|
| `valor_com_desconto` (leitura) | `22.95` | `22.95` |
| `valor_com_imposto` (leitura) | `25.25` | `25.25` |
| `total_item_sem_imposto` | `91.80` | `91.80` |
| `total_item_com_imposto` | `101.00` | **`100.98`** |
| pedido de 2 itens — `total_sem_imposto` | `183.60` | `183.60` |
| pedido de 2 itens — `ipi_total` | `18.40` | **`18.36`** |
| pedido de 2 itens — `total_com_imposto` | `202.00` | **`201.96`** |

Caso de referência: 4 × R$ 25,50 com −10% de desconto e +10% de IPI. O `ipi_total` agora bate com 10% da base de 183,60, que era a inconsistência visível no papel.

### Riscos residuais (decisão consciente, não esquecimento)

1. **`total_item` deixa de ser exatamente `qtd_total × valor_com_desconto`** quando o unitário não é exato. Trade-off aceito da opção (b). **Nenhum CHECK no banco verifica essa coerência.**
2. **PDF — este item foi escrito errado e está corrigido.** Nenhuma fórmula precisou mudar: `OrderValidationPdf.tsx:152` já calculava `IPI total` como `withTax − withoutTax`. A redação original afirmava que "refazer a conta a partir da coluna dá 101,00 e não 100,98" — **falso**, e a verificação em runtime (§7) mostrou por quê: as colunas por item são `VLR.TB` | `DESC.%` | `VLR. COM DESC.` | `IPI %` | `VLR C/ IMP` | `TOTAL S/IMP`, a coluna de total por linha é a **sem** imposto (`:150`, `item.total_item`) e `VLR C/ IMP` é unitário **informativo**, nunca multiplicado nem totalizado. **Não existe coluna de total com imposto por linha.** O que de fato sobra é a mesma diferença em `VLR. COM DESC.` × `QTD TOTAL` contra `TOTAL S/IMP`, e só quando o unitário com desconto não é exato — no caso medido, 22,95 × 4 = 91,80 **fecha**; no caso de dízima da fixture (R$ 10,00 com 33,33%), 6,67 × 3 = 20,01 contra 20,00 impresso. **BACKLOG-0069**, reclassificado como informativo.
3. **Pedidos históricos não são regravados.** O relatório SQL de auditoria é o inventário de quem diverge; abrir e salvar um pedido antigo o recalcula sob a política nova — **BACKLOG-0070**.
4. **Descoberto e NÃO corrigido:** `new Decimal(value ?? 0)` **lança** com string vazia (`[DecimalError] Invalid argument:`, verificado nesta data) — mesma classe já corrigida no SAC pelo BACKLOG-0057. Sem caminho HTTP hoje (o DTO exige `@IsNumber`), mas import de CSV ou chamada direta ao service responderia **500**. **BACKLOG-0067**.
5. **[PROB-0065](../PROBLEM_LEDGER.md) segue ABERTO e não foi tocado:** `writableFields` de `itens_pedido` inclui `total_item`, e o push de sync grava esse campo direto na tabela, **sem passar por `calculateOrderItem`** — segunda porta de escrita que desconhece a política nova. Nota acrescentada ao problema.
6. **Quatro implementações paralelas de `money()`** (backend `common/decimal`, frontend `lib/decimal`, os dois `sac-calculation`) e `brl()` duplicado nos dois PDFs. Foi o que fez esta mudança precisar ser escrita em dois arquivos. Limpeza fora de escopo aqui — **BACKLOG-0071**.

## 5. BACKLOG-0066 — troca de fornecedor preserva as linhas

### O que mudou (`frontend/src/pages/PedidoForm.tsx`)

- `ItemForm` ganhou `precisa_produto: boolean` — **flag explícita, não derivada** de `produto_uuid` vazio: linha recém-adicionada também está sem produto e não é órfã.
- `handleSupplierChange(nextUuid)` substituiu o `onChange` inline que fazia `setItems([newItem()])`. No-op se o fornecedor for o mesmo. Linha **com produto**: zera `produto_uuid`, `codigo_manual`, `descricao_manual`, `preco_unitario` e marca `precisa_produto`; **preserva** `uuid`, `qtd_caixas`, `qtd_unitaria`, `desconto_perc`, `ipi_perc`. Linha **manual** (sem `produto_uuid`): intocada — não depende do fornecedor.
- `chooseProduct` e `updateItem` limpam a marca: escolher um produto, ou digitar código/descrição (linha manual é válida).
- Sinalização: banner `role='status'` acima dos itens, destaque âmbar na linha e `aria-invalid` no select de produto.
- O bloqueio de submit **reusa** a validação que já existia em `submit()` ("Cada item precisa de um produto ou de código/descrição manual"). **Nenhuma regra nova.**

### Ganho crítico, além do enunciado do backlog

Preservar o `uuid` do item impede que o **PUT seguinte apague os itens no backend** — o `PUT /pedidos/:uuid` envia `itens` completo — e mantém os rótulos de foto do `OrderPhotosPanel`, que chaveia `itemLabels` por `item.uuid`. O comportamento antigo perdia os dois, e isso valia para **edição de pedido persistido**, não só para digitação em andamento. O enunciado do backlog descrevia apenas a perda de digitação.

### Teste

`frontend/src/pages/PedidoForm.spec.tsx` — **primeiro teste de componente desta tela.** Cobre: preserva as linhas e desvincula o produto; reselecionar o mesmo fornecedor é no-op; linha manual intacta; submit bloqueado com linha pendente e liberado ao escolher novo produto.

## 6. Comandos executados e resultado

| Comando | Resultado |
|---|---|
| `npx jest` (backend) | **51 suítes, 565 passed, 1 skipped**, 566 total |
| `npx vitest run` (frontend) | **13 arquivos, 88 passed** |
| `tsc --noEmit` (frontend) | limpo |
| `eslint` nos arquivos alterados (backend e frontend) | limpo |
| `node -e "new Decimal('')"` | **lança** `[DecimalError] Invalid argument:` — evidência do BACKLOG-0067 |

As duas suítes foram **reexecutadas nesta sessão de registro** e conferem com o relatado.

## 7. Verificação em runtime — EXECUTADA (2026-07-30)

Fechou **BACKLOG-0068**. Ambiente: Postgres em Docker (`renowa-dev-postgres`, :5433), backend :3000, frontend :5173. **Sessão real**: sem extensão de navegador disponível, o driver foi `osascript … do JavaScript … in tab N of window 1` na aba já logada do Safari, com as requisições saindo da aba e o cookie `HttpOnly` de sessão (`credentials: 'include'`). Sem framework de E2E.

### 7.1 Arredondamento — confirmado nas três camadas

| Camada | Evidência |
|---|---|
| **API** (pedido nº 19, `POST /pedidos`, 2 itens de 4 × R$ 25,50, −10%, +10%) | `total_sem_imposto "183.60"`, `total_com_imposto "201.96"`; item `qtd_total "4.000"`, `valor_com_desconto "22.95"`, `valor_com_imposto "25.25"`, `total_item "91.80"`, `total_com_imposto "100.98"`. IPI derivado (com − sem) = **18.36**; 10% de 183,60 = **18.36** |
| **Tela** (`/pedidos/:uuid/editar`, lida do DOM) | rodapé `R$ 183,60` / `R$ 201,96`; linha 1 `4 cx × 1 un = 4 · Sem IPI: R$ 91,80 · Com IPI: R$ 100,98` — **idêntico à API** |
| **Papel** (pedido nº 20, botão "Gerar PDF para validação", `pdftotext -layout`) | `Valor bruto R$ 204,00` / `Desconto total R$ 20,40` / `Total sem imposto R$ 183,60` / **`IPI total R$ 18,36`** / **`Total final R$ 201,96`**. Antes da mudança: 18,40 e 202,00 |

### 7.2 Troca de fornecedor — confirmada ponta a ponta

Em `/pedidos/:uuid/editar` de pedido com **2 itens persistidos**, Fornecedor A → B pelo select:

- **antes:** 2 itens, caixas `["4.000","4.000"]`, desconto `["10.00","10.00"]`, IPI `["10.00","10.00"]`, produto preenchido;
- **depois:** ainda 2 itens; caixas, desconto e IPI **idênticos**; produto vazio nas duas; `aria-invalid="true"` nos dois selects; banner `O fornecedor mudou: 2 itens precisam de um novo produto. Quantidades e percentuais foram preservados.`;
- **submit com linha pendente:** alerta `Cada item precisa de um produto ou de código/descrição manual.` e **o servidor não mudou** (2 itens, total intacto);
- **escolhido o Produto B nas duas linhas:** banner some, IPI passa a `5.00` (vem do produto), código atualizado, quantidades preservadas; save redireciona para `/pedidos/:uuid`;
- **`uuid` dos itens ANTES == DEPOIS** (`104dff6f-…`, `438fb7fa-…`) — **a regressão que apagava os itens no PUT está morta**. É exatamente o que o teste de componente não podia provar, por não haver backend nele;
- totais recalculados sob o fornecedor novo: `216.00` / `226.80` (4 × R$ 30,00, −10%, +5%), coerentes.

### 7.3 Limpeza

Todos os dados de teste (stamp `QA65594440`) removidos: 2 pedidos (`DELETE` com `?version=`), 2 produtos, 2 fornecedores, 1 cliente. A busca pelo stamp devolve **0** em pedidos, produtos, fornecedores e clientes. O PDF baixado foi apagado.

### 7.4 O que continua NÃO verificado

- **Relatório SQL de auditoria não executado** contra banco nenhum — não se sabe quantos pedidos históricos divergem, nem em dev nem em produção. **BACKLOG-0070** segue aberto como está.
- **Produção segue nunca verificada** (BACKLOG-0041, BACKLOG-0062).
- **Caminho de sync não exercitado** — [PROB-0065](../PROBLEM_LEDGER.md), a segunda porta de escrita que desconhece a política nova.
- **Nada foi commitado.** Tudo permanece no working tree, junto do que já estava das partes 3 e 4 de 2026-07-29/30.

## 8. Registros gerados

| Arquivo | IDs |
|---|---|
| `docs/BACKLOG.md` | BACKLOG-0065 **FECHADO**, BACKLOG-0066 **FECHADO**, BACKLOG-0068 **FECHADO** (verificação em runtime executada), BACKLOG-0069 **reclassificado para informativo**, BACKLOG-0067 / 0070 / 0071 **ABERTOS** |
| `docs/BUGFIX_LOG.md` | FIX-0023 (mudança de contrato de cálculo), FIX-0024 (troca de fornecedor) |
| `docs/PROBLEM_LEDGER.md` | PROB-0065 — nota de 2026-07-30, segue **ABERTO** |
| `docs/SYSTEM_OVERVIEW.md` | cabeçalho (parte 5), contagem de testes, bullet novo de contrato de cálculo, seção "Pedido comercial e validação" |

## 9. Recomendação final (revisada após a verificação em runtime)

1. ~~Rodar BACKLOG-0068 antes de qualquer deploy.~~ **Feito** — as duas mudanças estão confirmadas em API, tela, papel e persistência. Deixou de ser bloqueio.
2. **BACKLOG-0070 passou a ser o item de maior valor pendente:** a política nova está provada para pedido **novo**, e nada se sabe sobre o **histórico**. Rodar `backend/src/database/audits/order_calculation_divergences.sql` em dev e produção é leitura pura e responde quantos pedidos divergem.
3. **BACKLOG-0067 é barato e tem remédio pronto** no SAC — delegar a `backend-engineer` junto de qualquer próxima mexida em `orders`.
4. **BACKLOG-0069 é candidato a fechar como não-problema.** O papel medido fecha; o único desvio remanescente exige desconto de dízima e a conferência pela coluna unitária em vez do total da linha. Vale confirmar com o usuário/contador antes de fechar.
5. **[PROB-0065](../PROBLEM_LEDGER.md) é o risco estrutural que sobrou:** o sync grava `total_item` direto e não conhece a política nova. Nenhuma verificação desta rodada tocou esse caminho.
6. **BACKLOG-0071 (unificar `money()`) é higiene** — depois dos itens acima.
