# qa-safari — teste manual automatizado no Safari

Roteiro de teste de tela executado **dentro da aba já logada do Safari**, sem
framework de E2E: só `osascript … do JavaScript`, DOM e `fetch`. Preenche todo
campo de todo formulário, clica os botões, confere a conta contra a API e valida
os dois papéis (PDF do pedido e do SAC).

## Requisitos

1. App rodando (skill `run-app`): Postgres `5433`, backend `3000`, frontend `5173`.
2. Safari com **uma aba logada** no app na **janela 1**. O driver acha a aba pela URL.
3. Safari → Desenvolvedor → **Permitir JavaScript de Apple Events** habilitado.
4. `pdftotext`/`pdfimages` (poppler) para conferir o conteúdo dos PDFs baixados.

## Uso

```bash
cd ops/qa-safari
./run.sh inject          # (re)injeta o driver na aba
./run.sh phase p5 300    # roda uma fase, com timeout em segundos
./run.sh all             # roda a sequência inteira, salvando out/state-<fase>.json
./run.sh dump            # grava out/state.json com asserções, erros e tráfego
./run.sh reset           # zera o estado acumulado
```

`APP_URL_MATCH` troca o alvo (padrão `localhost:5173`).

Relatório da execução: veja o resumo em `out/state.json`:

```bash
jq -r '.asserts[]|select(.pass==false)|"\(.route) \(.name) :: \(.detail)"' out/state.json
jq -r '[.net[]|select(.status>=400)]|group_by(.u)[]|"\(length)x \(.[0].u) → \(.[0].status)"' out/state.json
```

## Fases

| Fase | O que faz |
|---|---|
| `p0` | sessão, `/auth/me`, health |
| `p1`–`p4` | transportadora (dialog), fornecedor, produto, cliente |
| `p3b` | foto do produto no catálogo: upload, aviso de PII, falha de upload sem duplicar produto, código único por fornecedor, replay do mesmo uuid |
| `p5` | pedido interno com 2 itens e código próprio por linha; confere o que o servidor guardou contra o digitado |
| `p6`, `p6b` | pedido externo; unicidade do número por fornecedor; enum de `origem` |
| `p7` | detalhe do pedido: total da API × soma dos itens × número na tela |
| `p8`, `p8b` | PDF do pedido antes e depois de liberar; `p8` confere que a foto do produto está embutida |
| `p7c` | liberar pedido |
| `p9` | faturamento: registrar nota, total faturado, divergência, status |
| `p10` | SAC: form, numeração, total, transição de status, PDF |
| `p11` | telas de edição carregam valores existentes |
| `p12` | varredura de todas as telas + preenchimento de filtros |
| `p13` | abas e modais do Financeiro |
| `p14` | limpeza (notas → pedidos → cadastros) |

## Armadilhas que o driver já contorna

- **Timer estrangulado em aba de fundo.** Safari suspende `setTimeout` fora da aba
  ativa; `run.sh` ativa o Safari e traz a aba para frente antes de cada fase.
- **`window.open` do PDF.** O papel abre uma aba de preview: interceptado por um
  objeto falso, senão a aba corrente muda e o driver perde o alvo.
- **`InputMoney` converte no blur.** O preenchimento dispara `focusout`; sem isso o
  campo fica com a string crua e o pedido salva preço 0.
- **Trocar o fornecedor reseta os itens do pedido** (`PedidoForm`). Por isso o
  passe 1 é completo e os seguintes só preenchem o que ficou vazio.
- **Estado canônico em `window.__QA_ST`.** Injeções novas reusam o mesmo objeto;
  sem isso um handler de erro antigo apaga o que foi acumulado depois.
- **`DELETE` de pedido e SAC exige `?version=`** (lock otimista) e recusa 409 se o
  pedido tiver nota fiscal ativa — a limpeza apaga as notas primeiro.
