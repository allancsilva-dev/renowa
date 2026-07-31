# Teste automatizado no Safari — todas as telas, todos os campos, os dois PDFs — 2026-07-30

**Data:** 2026-07-30 · **Repo:** `renowa`, branch `master`
**Escopo:** varrer o app inteiro na aba logada do Safari — abrir cada tela, preencher **todo** campo de **todo** formulário, clicar os botões, conferir as contas e validar o papel do pedido e o do SAC. Automação simples, sem framework de E2E.
**Alvo:** ambiente **local** (`localhost:5173` + backend `3000` + Postgres `5433`), sessão `admin@renowa.local` (role `admin`, 32 permissões).
**Nada foi commitado.** Driver novo em `ops/qa-safari/` (working tree).

O sistema publicado **não** foi testado: `renowa.zonadev.tech` resolve para `187.77.61.191`, a porta 443 aceita conexão mas o TLS recusa o nome — `error:1404B458 … tlsv1 unrecognized name` — e em HTTP puro o host devolve a página `Default Site` do openresty. Sem URL alcançável, o alvo virou o app local, por decisão do usuário.

---

## Método

Driver injetado por `osascript … do JavaScript … in tab N of window 1`: as requisições saem da aba real, com o cookie de sessão real, pelo mesmo caminho do navegador. Sem Playwright, Selenium ou WebDriver.

Três peças, em `ops/qa-safari/`:

- **`qa.js`** — instrumentação e utilidades: captura de `console.error`, `window.onerror`, `unhandledrejection`, e hook em `fetch` **e** `XMLHttpRequest` para registrar todo o tráfego com status e corpo de erro; `confirm`/`alert` respondidos e registrados; preenchimento genérico de `input`/`select`/`textarea`/combobox com valor válido por heurística de rótulo (CNPJ com dígito calculado, CEP, dinheiro em pt-BR, data de hoje); gerador de **JPEG real via canvas** (o backend valida magic bytes, não o `mimetype`).
- **`phases.js`** — 19 fases, de baseline a limpeza.
- **`run.sh`** — acha a aba pela URL, ativa a janela, injeta os arquivos, dispara a fase e faz polling até `__QA_DONE`, porque `do JavaScript` é síncrono e não espera Promise.

Conteúdo dos PDFs conferido fora do navegador, com `pdftotext -layout` e `pdfimages -list` sobre os arquivos baixados em `~/Downloads`.

### Cobertura

**360 asserções**, **209 campos preenchidos** em 32 escopos de formulário, **33 rotas** visitadas, 340 requisições registradas.

Telas exercitadas: `/dashboard`, `/clientes` (+ `novo`, `editar`), `/pedidos` (+ `novo`, `externo/novo`, `externo/:uuid/editar`, `:uuid`, `:uuid/editar`), `/sac` (+ `novo`, `:uuid`, `:uuid/editar`), `/produtos` (+ `novo`, `editar`), `/fornecedores` (+ `novo`, `editar`), `/transporte` (dialog de criação), `/financeiro` (abas Fluxo de Caixa, Parceiros, Custos, com os três modais), `/faturamento` (+ `:uuid` e o dialog de nota), `/configuracoes` (+ `usuarios`, `roles`, `auditoria`, `privacidade`), e rota inexistente (cai no dashboard, 912 chars, sem erro).

Fluxo completo de ponta a ponta, todo pela tela: transportadora → fornecedor → produto → cliente → pedido interno com 2 itens → pedido externo → fotos → papel → liberar → nota fiscal → SAC → transição de status → papel do SAC → limpeza.

---

## Resultado

Nenhum erro de JavaScript do app. Nenhuma tela em branco. Nenhum botão morto. Nenhuma requisição do app falhou de forma não recuperada. Todas as contas conferidas fecharam.

| Frente | Resultado |
|---|---|
| Preenchimento de campos | 209 campos; ao fim de cada formulário, **zero** campos vazios |
| Persistência do digitado | pedido interno: código, 2 caixas, 2 unidades, desconto 10%, IPI 10% chegaram idênticos ao servidor |
| Contas do pedido | `total_sem_imposto` 183,60 e `total_com_imposto` 202,00 batem com a soma dos itens e com o número na tela |
| Contas do SAC | total 127,50 = soma de `quantidade × valor_unitario`, igual na tela |
| Contas do faturamento | `total_faturado` 51,00 = soma das 2 notas; `divergencia` 151,00 = total − faturado; status virou `parcialmente_faturado` |
| Fotos | 2 fotos com nome do código vincularam ao item automaticamente; rádio "Usar no papel" habilitado, marcação persistiu (exatamente 1 marcada); `/conteudo` devolveu 200 |
| Filtros de lista | `?status=` e `?origem=` respondem 200; fora do enum, 400 com **mensagem de enum** e sem `should not exist` |
| Unicidade do pedido externo | mesmo número no mesmo fornecedor → **409**; em outro fornecedor → **201** |
| PDF do pedido | 390.917 B, `%PDF-1.3`, 1 página, 2 JPEGs de 480×320 embutidos (uma foto por linha de item) |
| PDF do SAC | 370.648 B, `%PDF-1.3`, 1 página, linha `DATA DE ABERTURA 30/07/2026` presente |
| Limpeza | tudo removido; busca pelo stamp `QA416499` devolve 0 em clientes, fornecedores, produtos, transportadoras, pedidos e SAC |

### Papel do pedido, conferido no arquivo

`pedido-validacao-renowa-18.pdf` — cabeçalho `PEDIDO PARA VALIDAÇÃO` / `AGUARDANDO VALIDAÇÃO`, os 20 campos de dados comerciais preenchidos, as 2 linhas de item com código, e o rodapé: bruto 204,00 · desconto 20,40 · sem imposto 183,60 · IPI total 18,40 · **total final 202,00**. `pdfimages` lista o logo mais duas imagens JPEG 480×320 — as fotos de teste, uma por item.

### Papel do SAC, conferido no arquivo

`sac-renowa-5.pdf` — `Nº ABERTURA SAC 5`, badge `EM ANDAMENTO`, faixa `SAC RENOWA`, as quatro linhas de cabeçalho (`DADOS DO CLIENTE`, `FORNECEDOR`, `NUMERO DE NFE`, **`DATA DE ABERTURA`**), item com quantidade 5 × R$ 25,50 e `TOTAL R$ 127,50`. É a primeira vez que o FIX-0019 é provado com PDF gerado, e não por leitura de código.

---

## Achados

### 1. O arredondamento do valor unitário infla o IPI impresso em R$ 0,04 (BACKLOG-0065)

Item com 4 unidades a R$ 25,50, desconto 10%, IPI 10%:

- unitário com desconto: 22,95
- unitário com imposto: 22,95 × 1,1 = 25,245 → **arredondado para 25,25**
- linha: 25,25 × 4 = **101,00** (aplicar o IPI ao total da linha daria 91,80 × 1,1 = **100,98**)

Com dois itens, o pedido fecha em 202,00 em vez de 201,96. O papel imprime `Total sem imposto R$ 183,60` e `IPI total R$ 18,40` — e 10% de 183,60 é 18,36. Os números são internamente consistentes (183,60 + 18,40 = 202,00) e **iguais** em tela, API e PDF: a política está num só lugar, `frontend/src/lib/orderCalculation.ts:19-20`, que arredonda o valor **unitário** para 2 casas antes de multiplicar pela quantidade, e o backend segue o mesmo contrato.

Não é defeito de código: é escolha de arredondamento. Mas o cliente que somar a coluna do papel vai achar 4 centavos de diferença no IPI. Decisão de regra, aberta no backlog.

### 2. Trocar o fornecedor descarta os itens do pedido sem aviso (BACKLOG-0066)

Em `/pedidos/novo` e `/pedidos/:uuid/editar`, mudar o `select` de fornecedor executa `setItems([newItem()])` (`PedidoForm.tsx:264`): toda linha já preenchida desaparece, sem confirmação e sem mensagem. Faz sentido no contrato — os produtos disponíveis são os do fornecedor —, mas um pedido de 20 linhas se perde num clique errado. Foi o que quebrou a primeira versão do driver, e um operador cai nisso do mesmo jeito.

### 3. Token expirado no meio da sessão: recuperação transparente (nenhuma ação)

Em `/configuracoes/roles`, quatro requisições devolveram **401 `Token não fornecido`** (`/api/roles`, `/api/permissions`, cada uma duplicada pelo StrictMode do dev). O app disparou **um** `POST /auth/refresh` → 204 — a coalescência da promise `refreshing` em `lib/auth.ts` evitou a tempestade — e repetiu as quatro com 200. A tela nunca mostrou erro. Registrado só como evidência de que o caminho funciona em runtime.

### 4. Upload de foto fecha quando o pedido sai de `em_aberto` (por design, agora provado)

`PedidoDetalhe.tsx:259` passa `editable = status === 'em_aberto' && hasPermission('pedidos.editar')`. Depois de liberar, o `input[type=file]` desaparece da tela — asserção explícita da suíte, não suposição. Consequência prática para quem for testar: **fotos têm de ser anexadas antes de liberar**.

### 5. Contratos que a suíte teve de aprender (documentação, não defeito)

- `POST /pedidos` **não** aceita `origem`, `numero_pedido_externo` nem `sistema_origem`: pedido externo tem rota própria, `POST /pedidos/externos`, e exige `valor >= 0.01`.
- `DELETE /pedidos/:uuid` e `DELETE /sac/:uuid` exigem **`?version=`** (lock otimista) — sem isso, 400 `version must not be less than 1`.
- `DELETE` de pedido com nota fiscal ativa devolve **409** com mensagem explícita; a limpeza precisa apagar as notas primeiro (`DELETE /faturamento/notas/:uuid?version=`).
- Faturamento vive em `/faturamento/pedidos`, `/faturamento/pedidos/:uuid`, `/faturamento/pedidos/:uuid/notas` e `/faturamento/notas/:uuid`. `GET /faturamento` é 404.
- Reconfirmado nesta rodada: pedido `liberado` **sem** nota fiscal é excluído com **204** — o comportamento que abriu o BACKLOG-0064 continua valendo.

---

## Falhas de asserção que **não** são defeito do app

Das 360 asserções, 9 falharam. Oito são iterações do próprio driver, todas re-executadas em verde depois da correção; a nona é comportamento correto do backend:

| Falha | Causa |
|---|---|
| duplicata de pedido externo → 400 | payload do teste sem `valor`; refeito em `p6b` → 409 |
| 3× fotos (código do item, input, rádio) | o teste lia `item.codigo`, mas a API expõe `codigo_manual`/`produto.codigo`; e o pedido já estava liberado, sem upload. Refeito em pedido novo → 2 de 2 vinculadas |
| ação de emitir nota não existe | o botão chama-se **"Registrar nota"**, por linha de pedido liberado |
| campo `VL UNI. (NF)` vazio no SAC | `InputMoney` é `type=text` com `inputMode=decimal` e só converte no blur; o filler passou a detectar por `inputMode` e a disparar `focusout` |
| `GET /faturamento` → 404 | rota certa é `/faturamento/pedidos` |
| limpeza do pedido nº 15 → 409 | **correto**: tinha nota fiscal ativa. Removido depois das notas, com 204 |

---

## O que **não** foi verificado

- **O sistema publicado.** Inalcançável daqui (TLS recusa o SNI). Tudo aqui é ambiente local.
- **`/login`.** Exercitar o formulário derrubaria a sessão que a suíte usa. Login não foi testado.
- **Importação CSV de produtos.** O modal existe em `/produtos` e não foi acionado — precisa de arquivo real e de decisão sobre o que importar.
- **Isolamento entre tenants.** A sessão é de um tenant só; nenhuma asserção cruzou fronteira. Isso continua coberto pelos testes unitários e pelo `db:verify`.
- **Julgamento visual.** A suíte prova conteúdo, número e comportamento; não diz se o layout está bonito ou se um espaçamento quebrou. Alinhamento e legibilidade seguem sendo inspeção humana.
- **Mobile.** Fora de escopo.
- **Concorrência.** Nenhuma corrida foi provocada nesta rodada.
