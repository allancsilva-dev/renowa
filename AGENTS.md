# Instruções do projeto

## Escopo atual

- Trabalhe exclusivamente no backend e no frontend.
- Não altere arquivos do workspace `mobile` nem implemente funcionalidades para mobile.
- Não inclua o mobile nas validações da tarefa.
- Essa restrição só pode ser removida por uma nova instrução explícita do usuário.

## Validação obrigatória após alterações de código

Antes de concluir qualquer tarefa que altere código, valide a alteração no(s) workspace(s) afetado(s).

- Execute o lint disponível.
- Execute o build e/ou a checagem de tipos disponível.
- Execute os testes automatizados relevantes para a alteração.
- Em mudanças compartilhadas ou que afetem mais de um workspace, valide todos os workspaces impactados.
- Se a alteração corrigir um defeito ou adicionar comportamento, crie ou atualize testes quando isso for viável.
- Não considere a tarefa concluída enquanto houver erro causado pela alteração.
- Nunca afirme que uma verificação passou sem tê-la executado.
- Se alguma verificação não puder ser executada por limitação do ambiente, dependência externa ou ausência de script, informe claramente qual comando não foi executado e o motivo.

Use os scripts definidos no `package.json` correspondente. Neste repositório, os comandos básicos são:

- Backend: `npm run lint --workspace=backend`, `npm run build --workspace=backend` e testes relevantes com `npm test --workspace=backend -- <filtro>` (ou a suíte completa quando necessário).
- Frontend: `npm run lint --workspace=frontend`, `npm run build --workspace=frontend` e `npm test --workspace=frontend` (Vitest).
- Shared: `npm test --workspace=shared` (Jest). Obrigatório ao mexer em `shared/`, que é consumido pelos dois lados.

Banco (quando a alteração tocar schema ou migration):

- `npm run db:migrate --workspace=backend` e `npm run db:verify --workspace=backend`, com `DATABASE_URL` apontando para o banco alvo. Exige `npm run build --workspace=backend` antes — os dois scripts rodam a partir de `dist/`.
- Migration já aplicada é imutável: alterar o arquivo, **inclusive só um comentário**, muda o checksum e trava `db:migrate` em todo banco que já a aplicou (PROB-0072). Correção de texto vai na migration nova ou na documentação.

Ao finalizar, resuma as validações executadas e seus resultados.

## Automação de teste no Safari (obrigatório ler antes de automatizar navegador)

Sempre que a tarefa pedir teste de tela, clique em botão, preenchimento de formulário, verificação de PDF ou "testar no navegador", use a ferramenta que já existe: **`ops/qa-safari/`**. Não escreva um driver novo, não instale Playwright/Selenium/WebDriver, não crie suíte de E2E — o projeto decidiu por automação simples via `osascript`. Detalhes de uso em `ops/qa-safari/README.md`; a primeira execução completa está em `docs/REVIEW_REPORTS/2026-07-30_teste-automatizado-safari-todas-as-telas.md`.

### Como funciona

O driver é JavaScript injetado na **aba já logada** do Safari por `osascript … do JavaScript … in tab N of window 1`. As requisições saem do navegador real, com o cookie de sessão real. Três arquivos: `qa.js` (instrumentação + utilidades + preenchimento genérico), `phases.js` (fases `p0`…`p14`), `run.sh` (orquestração).

```bash
cd ops/qa-safari
./run.sh tab             # índice da aba encontrada (0 = nenhuma; aborte)
./run.sh inject          # (re)injeta qa.js + phases.js
./run.sh phase p5 300    # roda a fase p5 com timeout de 300s
./run.sh all             # sequência inteira, salvando out/state-<fase>.json
./run.sh dump            # grava out/state.json (asserções, erros, tráfego, campos)
./run.sh reset           # zera o estado acumulado
```

Pré-condições, todas verificáveis antes de começar:

1. App de pé (skill `run-app`): Postgres `5433`, backend `3000` (`curl -s localhost:3000/api/health`), frontend `5173`.
2. Uma aba do app **logada**, na **janela 1** do Safari. `run.sh` acha a aba pela URL (`APP_URL_MATCH`, padrão `localhost:5173`).
3. Safari → Desenvolvedor → **Permitir JavaScript de Apple Events**. Teste com `osascript -e 'tell application "Safari" to do JavaScript "location.href" in tab N of window 1'`.
4. `pdftotext` e `pdfimages` (poppler) para conferir os PDFs baixados.

### Regras que evitam as falhas já conhecidas

- **`do JavaScript` é síncrono e não espera Promise.** Toda fase roda por `QA.run('pN')`, que grava o resultado em `localStorage.__QA_R` e liga `localStorage.__QA_DONE`; `run.sh` faz polling. Nunca conclua nada pelo retorno imediato da chamada.
- **A aba precisa estar ativa.** O Safari estrangula `setTimeout` em aba de fundo: blocos que só fazem `fetch` rodam, blocos que navegam e esperam render travam. `run.sh inject` ativa o Safari e traz a aba para frente — não pule esse passo, e avise o usuário que a tela será usada.
- **Nunca passe JS grande inline escapado para `osascript -e`.** Use arquivo: `do JavaScript (read POSIX file "…" as «class utf8»)`. É o que `run.sh` faz.
- **Editou `qa.js`? Recarregue a aba antes de confiar na instrumentação.** Os hooks de `console.error`/`fetch`/XHR são instalados uma vez por carga de página (`window.__QA_HOOKED`) e continuam apontando para o objeto de estado daquela injeção. Estado canônico fica em `window.__QA_ST`; sem o reload, um handler antigo faz `flush()` do estado velho e **apaga as asserções acumuladas**. Se acontecer: `./run.sh dump` antes, e depois `QA.restore(<json>)`.
- **`window.open` é interceptado.** O papel do pedido abre aba de preview dentro do gesto do clique; se ela abrir de verdade, a aba corrente muda e o driver perde o alvo.
- **Preenchimento de campo**: `nativeSet` faz `focus` → setter nativo → `input` → `change` → `focusout`. O `focusout` é obrigatório porque `InputMoney` (`type=text`, `inputMode=decimal`) só converte texto em número no blur — sem ele o pedido salva preço 0. **Exceção:** `input[role=combobox]` (`AsyncCombobox`) não pode receber blur, porque a lista só busca com o dropdown aberto; ali é `click` → `focus` → set sem blur → esperar `li[role=option]` → clicar.
- **Ordem no `PedidoForm` importa.** Trocar o fornecedor executa `setItems([newItem()])` e descarta os itens (BACKLOG-0066). Passe 1 preenche tudo; os passes seguintes usam `onlyEmpty: true` e `skip: /Fornecedor|Cliente/`. Depois, confira contra a API que quantidade, desconto e IPI digitados foram realmente salvos — valor default (`1.000`) na resposta indica escrita perdida em re-render, não sucesso.
- **Foto é do PRODUTO, não do pedido.** O detalhe do pedido não tem upload: a foto sobe no cadastro/edição do produto (`PUT /produtos/:uuid/foto`) e o papel a reaproveita em todo pedido que use aquele produto (`GET /pedidos/:uuid/itens/:itemUuid/foto`). O modelo antigo — foto anexada ao pedido, vínculo por nome de arquivo, rádio "Usar no papel" — saiu na `0040`. Item manual imprime célula de FOTO vazia, sem aviso.
- **JPEG tem de ser real.** O backend valida magic bytes, não `mimetype`; use o gerador via canvas (`QA.jpegBlob`).
- **Diálogos nativos.** `Dialog.tsx` usa `<dialog>` nativo (`Q.dlg()` cobre `dialog[open]`, `[role=dialog]` e overlay `.fixed form`). `window.confirm`/`alert` são interceptados e registrados, senão travam o AppleScript.

### Contratos de API que a suíte já aprendeu

- Pedido externo: `POST /pedidos/externos` (não `POST /pedidos`), com `valor >= 0.01` obrigatório. Mesmo número no mesmo fornecedor → 409; em outro fornecedor → 201.
- `DELETE /pedidos/:uuid` e `DELETE /sac/:uuid` exigem **`?version=`** (lock otimista); sem isso, 400.
- Faturamento: `/faturamento/pedidos`, `/faturamento/pedidos/:uuid`, `/faturamento/pedidos/:uuid/notas`, `/faturamento/notas/:uuid`. `GET /faturamento` é 404. O botão na tela chama-se **"Registrar nota"**.
- Excluir pedido com nota fiscal ativa → 409: apague as notas primeiro.
- Sessão expira no meio da corrida: o helper `QA.api` repete a requisição depois de `POST /auth/refresh`, igual ao app.

### Ordem, verificação de PDF e limpeza

Ordem que funciona: `p0` baseline → `p1`–`p4` cadastros (com `p3b` foto do produto logo depois da `p3`) → `p5` pedido interno → `p6`/`p6b` externo → `p7` contas → `p8` PDF → `p7c` liberar → `p8b` PDF pós-liberação → `p9` faturamento → `p10` SAC + PDF → `p11` telas de edição → `p12` varredura + filtros → `p13` Financeiro → `p14` limpeza.

PDF é verificado duas vezes: no navegador (blob com MIME `application/pdf`, cabeçalho `%PDF`, contagem de `/Type /Page`) e fora dele, sobre o arquivo em `~/Downloads`, com `pdftotext -layout` (conteúdo, totais, `DATA DE ABERTURA` no SAC) e `pdfimages -list` (fotos embutidas).

Toda execução **termina em `p14`** e depois confirma que não sobrou nada, buscando o stamp `QA<6 dígitos>` da rodada em clientes, fornecedores, produtos, transportadoras, pedidos e SAC. Se `p14` falhar em algum alvo, resolva na mão e diga qual ficou.

### Limites

- **Nunca rode contra o sistema publicado sem autorização explícita do usuário na tarefa.** Preenchimento de todos os campos cria registros reais no tenant alugado. Hoje `renowa.zonadev.tech` é inalcançável de qualquer forma: a porta 443 aceita conexão e o TLS recusa o nome (`tlsv1 unrecognized name`).
- **Não teste `/login`**: derruba a sessão que a suíte usa.
- A suíte prova conteúdo, número e comportamento. Layout, espaçamento e legibilidade continuam sendo inspeção humana — não afirme julgamento visual a partir dela.
