# Suíte do roteiro executada na aba logada do Safari — 2026-07-29

**Data:** 2026-07-29 · **Repo:** `renowa`, branch `master`
**Escopo:** executar o roteiro de teste das três frentes da parte 3 (pedido externo, fotos do pedido, SAC) contra o app rodando, com sessão real, em vez de conferir por leitura de código.
**Nada foi commitado.** Tudo no working tree.

**Estado de entrada:** as doze correções FIX-0008 a FIX-0019 e a migration `0038` estavam aplicadas no working tree e no banco de desenvolvimento, sem verificação em runtime.

---

## Método

O app subiu local (Postgres em `5433`, backend em `3000`, frontend em `5173`). A suíte rodou **dentro da aba já logada do Safari**, injetada por `osascript … do JavaScript … in tab 3 of window 1`: assim as requisições saem com o cookie de sessão real, pelo mesmo caminho do navegador, sem recriar login nem token.

O driver tem três peças:
- `01-harness.js` — `window.T` com `call()` sobre `fetch` (credenciais incluídas), `ok()` acumulando asserções, e um gerador de **JPEG real via canvas**, porque o backend valida magic bytes e não o `mimetype` do multipart.
- `window.__run(fn)` — o AppleScript é síncrono e não espera Promise, então o resultado fica em `window.__R` quando `window.__DONE` virar `true`.
- `poll.sh` — lê `__R` por polling até `__DONE`.

**Limitação do método, encontrada nesta rodada:** o Safari estrangula `setTimeout` em aba de fundo. Blocos só de `fetch` rodam normalmente em aba inativa; blocos que navegam pela UI e esperam render (`await esperar(2500)`) **travam** até a aba ficar ativa. Os blocos de tela exigem `set current tab of window 1 to tab 3`.

---

## Resultado

36 asserções. Blocos 3 (fotos), 4 (SAC), 5 (laço de miniatura) e 7 (limpeza) fecharam limpos, **inclusive o bug principal**: com 404 forçado em todo conteúdo, 9 miniaturas geraram 9 requisições, no máximo uma por foto — FIX-0008 confirmado em runtime.

| Bloco | Resultado | Observação |
|---|---|---|
| 2 — pedido externo | 4/7 úteis | duplicata 409, mesmo número em outro fornecedor 201 e PUT cruzado 409 passaram. Os **três** de filtro estavam contaminados (abaixo) |
| 3 — fotos do pedido | limpo | auto-vínculo por nome, sufixo `(1)`, arquivo que só finge ser JPEG → 400, 11ª foto → 409, teto de 10, conteúdo baixa como imagem, remoção 204 |
| 4 — SAC | limpo | numeração consecutiva por tenant, `version` 1, total derivado dos itens, `data` com hora → 400, `status` no corpo → 400, ciclo de transições e terminal recusado |
| 5 — laço de miniatura | limpo | 9 requisições para 9 fotos com 404 forçado (FIX-0008) |
| 7 — limpeza | limpo | dados de teste removidos |

---

## Quatro achados

### 1. BLOCKER — filtros de lista respondiam 400 (PROB-0081)

`GET /pedidos?origem=…`, `GET /pedidos?status=…` e `GET /sac?status=…` devolviam **400** `property <x> should not exist`. Na tela, escolher o filtro Origem em `/pedidos` imprimia **"Ocorreu um erro"**.

Causa: as rotas de lista misturavam `@Query() pagination: PaginationDto` com `@Query('status')` / `@Query('origem')` soltos. O `@Query()` sem chave faz o ValidationPipe validar o objeto de query **inteiro** contra o DTO, e com `whitelist` + `forbidNonWhitelisted` todo parâmetro fora dele derruba a requisição. `search` passava por já ser campo do `PaginationDto` — foi isso que fez o defeito parecer intermitente.

### 2. O falso positivo, e por que ele passou

Os três testes de filtro do bloco 2 afirmavam apenas `status === 400`:

```js
const origemRuim = await call('GET', '/pedidos?origem=externa');
ok('filtro: origem fora do enum devolve 400', origemRuim.status === 400, `${origemRuim.status}`);
```

O 400 vinha, mas do **whitelist**, não do enum. A validação de enum em `orders.service.ts` e `sac.service.ts` era **inalcançável por HTTP**: a requisição morria no pipe antes do handler. Ou seja **FIX-0014 nunca esteve provado**, e o teste que deveria provar passava exatamente porque o código estava quebrado de outro jeito.

Um teste de status HTTP sozinho não distingue "recusou pelo motivo certo" de "recusou por outro motivo". A correção do teste é asserção de **mensagem**: `Origem inválida. Use um de: interno, externo.` e a ausência de `should not exist`.

### 3. LOW — miniatura mentia quando o download falhava (PROB-0082)

Com 404 em todo conteúdo, as 9 miniaturas ficaram em "Carregando..." indefinidamente. **Não é laço** — a guarda `buscados` segura o efeito, e é justamente o FIX-0008 —, mas faltava estado de erro: a única condição de render era `thumbs[uuid] ? <img> : "Carregando..."`.

### 4. Afirmação errada do roteiro — DELETE de pedido liberado

O roteiro afirmava que excluir pedido `liberado` devolve **409**. Observado: **204**, com soft delete efetivado. A guarda de `OrdersService.remove()` só barra pedido com **nota fiscal ativa**; o status não bloqueia nada.

Nada foi alterado no código: é pergunta de regra de negócio, aberta em BACKLOG-0064. **A afirmação do roteiro está corrigida aqui.**

Confirmado de novo na rodada seguinte, no bloco de limpeza: pedido nº 7 com `status_pedido=liberado` → `DELETE 204`.

---

## O que NÃO foi verificado

- **Papel do SAC em runtime.** `SacTicketPdf` não foi renderizado; a linha `DATA DE ABERTURA` do FIX-0019 foi conferida por leitura, não por PDF gerado.
- **Itens 2 e 8 do checklist visual** do roteiro — inspeção humana de layout, fora do alcance de asserção automatizada.
- **Isolamento entre tenants.** A sessão é de um tenant só. Nenhuma asserção cruzou fronteira de tenant; o que existe sobre isso são os testes unitários e o `db:verify [5/6]`/`[6/6]`.
- **Concorrência**, nesta rodada. O teto de 10 fotos e a numeração de SAC por tenant continuam provados apenas pelo smoke SQL e pelas 50 emissões paralelas da parte 3. (Na rodada seguinte, a marcação simultânea de foto do papel **foi** exercitada — ver o relatório de implementação.)
- **Mobile.** Fora de escopo, e `pedido_fotos` não participa do sync.

---

## Correção de drift na documentação

O roteiro afirmava 409 para exclusão de pedido liberado. Corrigido para 204, com a pergunta de regra registrada em BACKLOG-0064 em vez de tratada como defeito.
