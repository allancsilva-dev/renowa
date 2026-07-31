# Foto de catálogo alinhada ao inventário de PII, e QA de tela sem fase morta — 2026-07-31

Fechamento dos itens que a revisão independente de 2026-07-30 deixou em aberto (P2-1, P2-2,
P3-1, P3-2, P3-3), registrados no arquivo temporário `docs/ErrosAtuais.md`, **removido nesta
data**. Este relatório existe para que o conteúdo de verificação daquele arquivo não se perca:
ele nunca esteve no git (`git log --all -- docs/ErrosAtuais.md` → 0 commits).

Correções em **FIX-0026**; risco residual em **PROB-0083**; follow-ups em **BACKLOG-0073** a
**BACKLOG-0077**.

---

## Achado central: três itens eram a mesma dívida

`produto_fotos.origem_pedido_id` era vestígio de `pedido_fotos`. **Nenhum caminho de código a
escrevia** — `ProductPhotosService.upsert` gravava `null` sempre, e a única fonte possível era o
bloco de migração da `0040`, que roda sobre tabela vazia.

Consequências, todas verificadas em código antes de agir:

1. A regra de ERASURE de `produto_fotos` gerava
   `UPDATE ... WHERE tenant_id = $1 AND origem_pedido_id IN (SELECT id FROM pedidos ...)` —
   predicado que **nunca casa linha nenhuma**. O inventário declarava um controle inexistente.
2. Se a coluna voltasse a ser preenchida, o ERASURE de **um** cliente apagaria a foto de
   catálogo compartilhada pelos pedidos de todos os outros (era o P2-2).
3. O desempate ausente do `DISTINCT ON` (`0040:191`) só importaria nesse mesmo cenário (P3-3).

Solução: migration `0042` dropa a coluna e a FK, com guarda que **aborta** se houver linha
vinculada; `produto_fotos` sai do `PII_REGISTRY` para `TABELAS_SEM_PII` com justificativa; e o
controle real passa a ser o aviso na tela (P2-1). A `0040` **não foi editada** — está aplicada e
é imutável (PROB-0072).

---

## Estado verificado — não gastar token reverificando

Tudo abaixo foi conferido no código, no banco de dev e nos testes, e **passou**. Herdado da
revisão de 2026-07-30 e revalidado nesta data onde a mudança tocou.

| Item | Evidência |
|---|---|
| IDOR em `GET /pedidos/:uuid/itens/:itemUuid/foto` | `order-item-photos.service.ts:24-36` (tenant + `vendorOwnershipWhere` + 404, nunca 403) e `:40-43` (item filtrado por `pedido_id = order.id`). Specs `:55-62`, `:66-72`, `:106-111` |
| Validação antes de qualquer escrita | `validateImageUpload` é a primeira linha de `upsert`; spec prova que a transação nem abre |
| Executável renomeado e SVG recusados | Magic bytes só JPEG/PNG/WEBP (`image-validation.ts:23-33`); CHECK do banco também recusa `image/svg+xml` (23514 reproduzido) |
| Headers nos DOIS endpoints de bytes | `product-photos.controller.ts` e `order-item-photos.controller.ts` — idênticos (`nosniff`, `Content-Disposition`, `Cache-Control: private`). Reconfirmado em runtime: `private, max-age=3600` |
| Binário não vaza | `select: false` em `product-photo.entity.ts`; `Product` não tem relação inversa; único `addSelect('f.conteudo')` no service |
| Purga satisfaz `produto_fotos_storage_check` nos 3 caminhos | `upsert`, `remove`, `removeByProductId`→`purgeActive` — sempre `('purgado', null, null)` |
| `remove` confere `version` ANTES de zerar bytes | `optimistic-concurrency.ts:94` roda como primeira instrução da transação. Com teste: 409 com version velha não zera byte nenhum |
| `ProductsService.remove` arrasta a foto, com tenant | Atômico e com teste: purga e `softDelete` na mesma transação |
| Sem referência viva a `pedido_fotos` / `OrderPhoto` / `usar_no_papel` | Grep limpo fora de migrations históricas. O último resquício executável (`phases.js`) saiu nesta rodada |
| `0040` bem formada para o runner | Nome casa o padrão; sem `BEGIN;`/`COMMIT;` próprios; `migrations-hygiene.spec.ts:53-63` cobre |
| Fotos purgadas por ERASURE não ressuscitam | `0040:190` — `f.storage_backend <> 'purgado'` |
| `DROP TABLE` não deixa órfão | `uq_itens_pedido_tenant_id_id` de pé; `db:verify` → `OK: schema íntegro` |
| A spec de inventário de PII tem dentes | `pii-registry.spec.ts:49-62` varre todo `*.entity.ts` com `@Entity('...')` + `tenant_id` e reprova o não classificado. **Ressalva: só pega tabela que tem entity TypeORM** |
| Um download por produto distinto, mesma chave nas duas pontas | `itensComProdutoDistinto` decide o download e o PDF indexa por `item.produto.uuid` |
| Larguras do PDF somam 100,0% e FOTO é a primeira coluna | Item manual cai em célula vazia pela guarda `item.produto?.uuid && fotosPorProduto[...]` |
| Guarda FIX-0008 contra laço de requisições | `ProductPhotoField.tsx:41-42` — `baixados.current.add()` **antes** do fetch. Upload passa por `downscaleImage` |

### Invariantes de banco exercitadas (transação revertida, sem resíduo)

Banco de dev: `postgresql://renowa:devpassword@localhost:5433/renowa`. `pedido_fotos` não existe.

`produto_fotos` (`0040`):

| invariante | resultado |
|---|---|
| duas fotos ativas no mesmo produto | 23505 `uq_produto_fotos_produto` |
| mime fora da whitelist | 23514 `produto_fotos_mime_type_check` |
| `tamanho_bytes` = 3145729 | 23514 `produto_fotos_tamanho_bytes_check` |
| linha `'db'` sem `conteudo` | 23514 `produto_fotos_storage_check` |
| soft delete libera a vaga | `INSERT 0 1` |
| `tenant_id` alheio | 23503 `fk_produto_fotos_tenant_produto` |

`produtos` (`0041`):

| invariante | resultado |
|---|---|
| mesmo código, mesmo fornecedor, ambos ativos | 23505 `uq_produtos_codigo` |
| mesmo código em OUTRO fornecedor | `INSERT 0 1` |
| soft delete libera o código | `INSERT 0 1` |
| dois produtos com `codigo` NULL | `INSERT 0 1` nos dois — NULL não colide |

`produto_fotos` (`0042`, nesta data):

| invariante | resultado |
|---|---|
| guarda da migration com linha vinculada | `ERROR: produto_fotos tem linha com origem_pedido_id nao nulo…` (transação revertida) |
| coluna e FK após a migration | `origem_pedido_id` ausente; `fk_produto_fotos_tenant_pedido_origem` ausente |
| o que sobreviveu | 4 CHECKs + `version_check`, `fk_produto_fotos_tenant_produto`, `uq_produto_fotos_produto` parcial |

---

## Execução da suíte de Safari (sessão real, stamp `QA944966`)

`p0` → `p14`, **285 asserções**, 0 erro de console ou HTTP capturado. As 4 asserções vermelhas
no `state.json` são a `p8` rodada **antes** da correção do driver (abaixo); a re-execução da
mesma fase, no mesmo arquivo de estado, passou.

**`p3b` — fase nova, 41 asserções, todas verdes.** Persiste no repositório o roteiro que a
verificação do P1-1 rodou de arquivo temporário:

| o que | resultado |
|---|---|
| aviso de PII junto ao campo de foto | presente |
| upload no produto | `200`, `image/jpeg`, `Cache-Control: private, max-age=3600` |
| falha de upload injetada em `fetch` | banner "o produto foi salvo, mas a foto não subiu"; botões "Tentar enviar a foto" e "Continuar sem a foto"; tela parada em `/produtos/novo` |
| produto após a falha | **1** |
| segunda tentativa | **1** produto — não duplicou; foto `200` |
| mesmo código, mesmo fornecedor | `409` "Código COD-QA944966 já cadastrado para este fornecedor" |
| mesmo código, outro fornecedor | `201` |
| replay do MESMO uuid | `201`/`201`, mesmo registro devolvido, **1** linha no catálogo |

**Papel do pedido (`p8`, `p8b`).** `application/pdf`, `%PDF-1.3`, 387.876 B / 387.845 B, 1
página, **4 imagens embutidas**. Conferido fora do navegador:

```
pdfimages -list → 2 JPEGs 480×320 (um por linha de item) + logo com máscara alfa
pdftotext       → coluna FOTO presente; 183,60 / IPI total 18,36 / 201,96
```

**Limpeza (`p14`).** 204 nos 12 alvos, incluindo os três produtos extras que a `p3b` registra em
`st.ids.extras`. Banco de dev de volta a **4 produtos / 7 pedidos / 0 fotos ativas / 0 bytes
vivos**, e **0** resíduo do stamp em clientes, fornecedores, produtos, transportadoras, pedidos
e SAC.

### Defeito do próprio driver, achado e corrigido na execução

A `p8` reprovou com `text/javascript`, `";u82=Uin"` e 0 páginas — e o papel estava perfeito.
`armarCapturaPdf` guardava o **primeiro** blob que passasse por `URL.createObjectURL`, e o Vite
em dev cria blob de módulo (`text/javascript`) ao resolver import dinâmico — que é exatamente
como `PedidoDetalhe` carrega o gerador de PDF. O hook passou a ignorar blob do carregador de
módulos, **e só ele**: qualquer outro tipo continua sendo capturado, para a asserção de MIME
poder reprovar de verdade se o app gerar coisa errada.

Vale registrar por que isso importa além do conserto: **contar páginas nunca teria denunciado
nada**. Foi a asserção nova de imagem embutida que mostrou que o artefato conferido não era o
papel.

---

## O que **não** foi verificado

- **P1-3 (permissão da foto para quem só tem `produtos.criar`) segue sem verificação em
  navegador.** Exige um segundo perfil e outra sessão, e a suíte não pode tocar `/login` — a
  corrida de hoje rodou como `admin`. Coberto por teste (`product-photos.permissions.spec.ts`
  trava a permissão dos quatro endpoints). Registrado em **BACKLOG-0077**.
- **Produção.** Nada nesta rodada tocou produção; `pedido_fotos` lá **não foi consultada** — não
  há acesso a partir deste ambiente. É o objeto do **BACKLOG-0076**.
- **O caso "mesmo código em outro fornecedor" da `p3b` depende de já existir um segundo
  fornecedor no tenant.** Se não houver, a fase registra uma nota e **pula** o caso em vez de
  falhar. Rodou hoje porque o tenant de dev tem outros fornecedores.
- **Layout e legibilidade** continuam sendo inspeção humana: a suíte prova conteúdo, número e
  comportamento.

---

## Números

| medição | backend | frontend | shared |
|---|---|---|---|
| antes desta rodada | 56 suítes · 602 passed, 1 skipped | 15 arquivos · 107 passed | 1 suíte · 9 passed |
| **depois** | **56 · 602 passed, 1 skipped** | **17 · 109 passed** | idem |

Lint e build limpos nos três. `db:migrate` aplicou a `0042` no dev; `db:verify` → `OK: schema
íntegro` (34/34 CHECKs, 8/8 índices parciais, 0 FK sem isolamento).

**`npm test --workspace=shared` só funciona da raiz** — de dentro de `frontend/` falha com
`npm error No workspaces found`.

**Nada desta rodada foi commitado — tudo no working tree.**
