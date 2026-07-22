# Fluxo Comercial Completo (pedidos → faturamento → comissão → caixa) — implementação

- **Data:** 2026-07-22
- **Tipo:** relatório de implementação (não é auditoria/revisão externa — registra o estado real de uma entrega já concluída pelo agente implementador)
- **Origem:** plano aprovado pelo usuário em `/Users/Zero/.claude/plans/fluxo-comercial-completo-buzzing-seal.md`
- **Registrado por:** `docs-reporter`, a partir do resumo do agente implementador + verificação direta de código/git nesta sessão (não reexecutou testes/lint/build — sem acesso a `node`/`npm` neste agente)

## Objetivo

Fechar o ciclo comercial completo do Renowa: criação de pedido → liberação → faturamento (nota fiscal) → geração de comissão → refletir no caixa/dashboard financeiro. Inclui consulta de CNPJ (BrasilAPI), importação de produtos via planilha, novos formulários de fornecedor/cliente com endereço completo, e nova tela de Faturamento.

## Estado de commit (verificado nesta sessão)

**Confirmado por `git status` no momento deste registro: toda a implementação está no working tree, sem nenhum commit.** O `HEAD` atual (`4b977a8`) é o fechamento do overhaul de RBAC (entrega anterior, já commitada); nenhum commit do "Fluxo Comercial Completo" existe em `master`. Isso inclui as 5 migrations SQL (`0026`–`0030`), que **já foram aplicadas contra o Postgres de dev** (`renowa-dev-postgres`) mas cujo arquivo `.sql` ainda não está commitado — ou seja, o schema do banco de dev está à frente do que está versionado em `master`.

Arquivos novos (untracked) confirmados: `backend/src/consultas/` (módulo completo), `backend/src/faturamento/` (módulo completo), `backend/src/database/migrations/0026_client_supplier_contact_fields.sql` a `0030_permission_catalog_faturamento.sql`, `backend/src/finance/dto/commission-action.dto.ts`, `backend/src/products/dto/import-products-result.dto.ts`, `backend/src/products/products.service.spec.ts`, `backend/src/suppliers/dto/`, `frontend/src/components/ui/AsyncCombobox.tsx`+`.spec.tsx`, `frontend/src/lib/clientSelection.ts`+`.test.ts`, `frontend/src/lib/orderPermissions.ts`+`.test.ts`, `frontend/src/pages/Faturamento.tsx`, `frontend/src/pages/FaturamentoDetalhe.tsx`, `frontend/src/pages/FornecedorForm.tsx`, `frontend/src/services/faturamento.service.ts`, `frontend/src/services/products.service.test.ts`, e o diretório `.impeccable/` (relatório da crítica de design, ver abaixo).

Arquivos modificados (tracked, não staged) confirmados: `backend/src/app.module.ts`, `backend/src/clients/dto/create-client.dto.ts`, `backend/src/clients/entities/client.entity.ts`, `backend/src/database/cross-tenant-foreign-keys.spec.ts`, `backend/src/finance/entities/commission.entity.ts`, `backend/src/finance/finance.controller.ts`, `backend/src/finance/finance.service.ts`+`.spec.ts`, `backend/src/orders/entities/order.entity.ts`, `backend/src/orders/orders.controller.ts`, `backend/src/orders/orders.service.ts`+`.spec.ts`, `backend/src/products/products.controller.ts`+`.service.ts`, `backend/src/suppliers/entities/supplier.entity.ts`, `backend/src/suppliers/suppliers.controller.ts`+`.service.ts`, `shared/src/permissions/catalog.ts`+`.spec.ts`, `frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/pages/ClienteForm.tsx`, `frontend/src/pages/Financeiro.tsx`, `frontend/src/pages/Fornecedores.tsx`, `frontend/src/pages/PedidoDetalhe.tsx`+`PedidoForm.tsx`+`Pedidos.tsx`, `frontend/src/pages/ProdutoForm.tsx`+`Produtos.tsx`, `frontend/src/services/{clients,orders,products,suppliers}.service.ts`, `frontend/src/types/index.ts`, `backend/package.json`, `frontend/package.json`, `package-lock.json` (nova dependência `xlsx`), e um arquivo deletado: `backend/src/finance/dto/update-comissao.dto.ts` (dead code removido).

Arquivo `backend/src/database/cross-tenant-foreign-keys.spec.ts` modificado nesta entrega — não verificado por este agente o motivo exato da mudança (candidato a conferir: provavelmente ajuste do teste de invariantes para cobrir as novas FKs compostas de `notas_fiscais`/`comissoes` das migrations `0028`/`0029`; suposição, não confirmada por leitura linha a linha nesta sessão).

## Escopo verificado por este agente (`docs-reporter`)

Este agente **não reexecutou** testes/lint/build (sem acesso a `node`/`npm`/shell de banco nesta sessão) — os números de teste (236 backend, 29 frontend) são os reportados pelo agente implementador, não reverificados de forma independente. Verificações diretas feitas nesta sessão:
- `grep`/leitura de `shared/src/permissions/catalog.ts` — confirmado módulo `FATURAMENTO`, slugs `PedidosLiberar`/`FaturamentoVer`/`FaturamentoEditar`.
- `ls`/`wc -l` das 5 migrations novas (`0026`–`0030`), confirmando existência e tamanho.
- Leitura de `backend/src/app.module.ts:42-46` — confirmado `synchronize: true` condicionado a `NODE_ENV !== 'production'`.
- Leitura de `backend/src/database/migrations/0020_utc_timestamps_db_authority.sql:31,74` — confirmado que a migration declara `set_updated_at()`+trigger (base do PROB-0060).
- `grep` confirmando `PedidoForm.tsx:247` (`setItems([newItem()])` sem confirmação), ícone `Unlock` em `PedidoForm.tsx`/`PedidoDetalhe.tsx`, e os 7 call sites de `confirm()`/`window.confirm()` nativo.
- `ls` confirmando existência de `frontend/src/components/ui/AsyncCombobox.tsx`, `frontend/src/pages/FornecedorForm.tsx`, `frontend/src/pages/Faturamento.tsx`/`FaturamentoDetalhe.tsx`, `backend/src/consultas/`, `backend/src/faturamento/`.
- `grep` confirmando `suppliers.service.ts:30` já contém `.andWhere('s.deleted_at IS NULL')` (fix aplicado, ver BUG-0018).
- `git status`/`git log` confirmando o estado de commit descrito acima.

## Resumo funcional da entrega (conforme reportado pelo implementador, não re-executado por este agente)

- **Fase 1 (catálogo de permissões):** módulo `FATURAMENTO`; slugs `pedidos.liberar`, `faturamento.ver`, `faturamento.editar`; papel `financeiro` ganhou `pedidos.ver`/`pedidos.liberar`/`faturamento.ver`/`faturamento.editar`; catálogo de 25→28 entradas; 8/8 testes.
- **Fase 2 (migrations `0026`–`0030`):** endereço completo em `clientes`/`fornecedores`; normalização e `CHECK` de status de `pedidos` (`em_aberto`, `liberado`, `parcialmente_faturado`, `faturado`, `cancelado`); tabela `notas_fiscais` (FK composta tenant, índice único parcial por pedido+número); `comissoes` ganhou `pedido_id`/`nota_fiscal_id`/`data_pagamento`, FKs compostas, índice único parcial, `CHECK` de status (`pendente`, `faturado`, `pago`); permissões novas concedidas via `tenant_role_permissions`. Todas aplicadas com sucesso no Postgres de dev (`renowa-dev-postgres`).
- **Fase 3 (backend, 236 testes reportados):** módulo `consultas` (`GET /consultas/cnpj/:cnpj` via BrasilAPI, sem RBAC dedicado — decisão confirmada com o usuário, só exige autenticação); `POST /produtos/importacao` (multipart, lib `xlsx`); DTOs de clientes/fornecedores; `OrdersService.liberar()` + `PATCH /pedidos/:uuid/liberar`; `updateStatus` restrito a `cancelado`; bloqueio de edição pós-liberação; módulo `faturamento` (entity `NotaFiscal`, CRUD com recálculo de status do pedido e comissão 1:1); `Commission` ganhou `pedido_id`/`nota_fiscal_id`/`data_pagamento` + `informarPercentual`/`registrarPagamento`; dead code `finance/dto/update-comissao.dto.ts` removido; BUG-0018 (`SuppliersService.findAll` vazava fornecedores soft-deletados) corrigido nesta fase.
- **Fase 4 (frontend, 29 testes reportados):** `AsyncCombobox.tsx` (combobox assíncrono paginado, ARIA); `FornecedorForm.tsx`; unificação de criação de produto na rota dedicada; botão "Consultar CNPJ" em Cliente/Fornecedor; rota/sidebar "Faturamento" (`Faturamento.tsx`+`FaturamentoDetalhe.tsx`); `PedidoForm.tsx`/`PedidoDetalhe.tsx` com estados novos, botão liberar, bloqueio pós-liberação; `Financeiro.tsx` sem criação manual de comissão no fluxo principal.
- **Crítica de design pós-implementação** (`/impeccable critique`, snapshot em `.impeccable/critique/2026-07-22T17-30-23Z__edidodetalhe-financeiro-fornecedores-asynccombobox.md`, score 23/40 "Aceitável"): 4 P1 + 1 P2. Por decisão do usuário, só os 3 P1 de consistência visual do módulo Financeiro foram corrigidos nesta rodada (migração das 6 tabelas para `DataTable`, ícones Lucide no lugar de emoji, cores remapeadas para tokens do design system). Validado: 29/29 testes de frontend ainda passando após as correções (reportado pelo implementador).

## Achados registrados em outros documentos (não repetidos aqui)

- **PROB-0059** — `synchronize:true` em dev + migrations SQL coexistindo, já causou drop silencioso de 4 invariantes (ver `PROBLEM_LEDGER.md`).
- **PROB-0060** — drift pré-existente de triggers `set_updated_at` da migration `0020`, ausentes no Postgres de dev (ver `PROBLEM_LEDGER.md`).
- **BUG-0018** — `SuppliersService.findAll` corrigido para filtrar `deleted_at IS NULL` (ver `BUGFIX_LOG.md`).
- **BACKLOG-0021** — troca de fornecedor no cabeçalho do pedido apaga itens sem aviso.
- **BACKLOG-0022** — "Liberar pedido" sem confirmação + ícone `Unlock` semanticamente invertido.
- **BACKLOG-0023** — 7 call sites de ações destrutivas usando `confirm()`/`window.confirm()` nativo em vez do `Dialog` do design system.
- **Observação menor, sem item dedicado:** ainda restam usos de `teal-100`/`text-teal-500`/`text-teal-700` (Tailwind puro, fora dos tokens `primary-*`) em `Financeiro.tsx` (ícone Wallet, saldo positivo, valores de comissão, badge "pago") — mesma causa raiz do achado de cor corrigido nesta rodada, mas fora da lista literal dos 3 P1 corrigidos. Também `orderStatusColor` em `frontend/src/types/index.ts` usa blue/orange/green Tailwind puro para status de pedido — convenção pré-existente e compartilhada entre telas, fora de escopo desta rodada.

## Recomendação final

1. **Commitar a implementação.** Todo o trabalho descrito está no working tree sem nenhum commit — risco de perda de trabalho e de divergência entre o schema já aplicado em dev (migrations `0026`–`0030`) e o que está versionado em `master`. Fora da permissão deste agente (`docs-reporter` não commita) — delegar ao dono da implementação/usuário.
2. **Decisão de arquitetura pendente sobre `synchronize:true` em dev** (PROB-0059) — delegar a `software-architect`/`database-engineer` antes que o padrão se repita em uma próxima entrega com migrations SQL.
3. **Investigar o alcance do drift de triggers `updated_at`** (PROB-0060) em staging/produção — delegar a `database-engineer`.
4. Os 3 itens de UX adiados (BACKLOG-0021 a BACKLOG-0023) ficam para uma rodada futura de frontend, por decisão já tomada pelo usuário nesta sessão.

## Status final

**PASS_COM_RESSALVA** — funcionalidade completa e testada conforme reportado pelo implementador (não reverificado por este agente), mas com 2 achados de risco estrutural abertos (PROB-0059/0060), 3 itens de UX adiados por decisão do usuário (BACKLOG-0021 a 0023), e toda a entrega ainda sem commit no momento deste registro.
