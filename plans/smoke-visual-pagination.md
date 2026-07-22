# Smoke visual — fetchAllPages + droplists vazios

## Objetivo
Confirmar em navegador (Safari) que os dropdowns carregam a lista **inteira** (sem truncar em 100/20) e que todo droplist começa **vazio**, sem regressão de auto-fill.

## Pré-requisitos
1. **Backend no ar**: `http://localhost:3000` (proxy `/api`).
2. **Frontend dev**: `cd frontend && npm run dev` → `http://localhost:5173` (porta fixa no `vite.config.ts`).
3. **Login admin**: as telas de Auditoria e Privacidade são `adminOnly`.
4. **Dado de teste (crítico p/ provar o fix)**: para *ver* o truncamento resolvido, uma das listas precisa ter **>100 registros** (fornecedores, transportadoras ou produtos de um fornecedor) e a de usuários **>20** (prova o bug do Vendedor). Se não houver massa de dados, usar a verificação por **Network** (abaixo) — igualmente válida.

### Verificação por Network (quando faltar massa de dados)
Abrir DevTools → Network, filtrar por `page=`. Ao abrir o dropdown esperado:
- Lista com >100 itens → devem aparecer **múltiplas** requisições `?...&page=1&limit=100`, `page=2`, ... até cobrir `meta.totalPages`.
- Lista ≤100 → **uma** requisição `page=1&limit=100`. Ambos comprovam que `fetchAllPages` está no caminho e respeita o teto de 100.

## Roteiro por tela

| # | Rota | Ação | Esperado |
|---|---|---|---|
| 1 | `/produtos/novo` | Abrir dropdown **Fornecedor** | Carrega todos os fornecedores (não corta em 100/200). Placeholder vazio. |
| 2 | `/configuracoes/auditoria` | Ver coluna **Responsável** | Mostra nomes reais dos atores (não "Usuário do sistema" por falta de match). Cobre users além de 100. |
| 3 | `/clientes/novo` | Preencher e disparar auto-fill de **transportadora** | Auto-fill de transportadora/endereço **não regride**. Dropdown UF começa vazio. |
| 4 | `/pedidos/novo` | Dropdown **Fornecedor** | Lista completa; placeholder vazio. |
| 5 | `/pedidos/novo` | Dropdown **Vendedor** (precisa `canChooseVendor`) | **Não trunca em 20**; lista todos os vendedores ativos; placeholder vazio. |
| 6 | `/pedidos/novo` | Escolher fornecedor → dropdown **Produtos** | Produtos do fornecedor carregam completos (filtro `fornecedor_uuid` preservado). |
| 7 | `/pedidos/:uuid/editar` | Abrir pedido existente | Cliente/fornecedor/transportadora/vendedor pré-selecionados corretos (sem regressão no edit). |
| 8 | `/financeiro` | Dropdown **Fornecedor** | Placeholder vazio; lista carrega. |
| 9 | `/configuracoes/privacidade` | Dropdown **Cliente** | Durante o load mostra "Carregando clientes..."; depois placeholder **vazio** (não "Selecione um cliente"). |

## Checklist de aprovação
- [ ] Nenhum dropdown exibe o texto "Selecione".
- [ ] Privacidade ainda mostra "Carregando clientes..." no estado de loading.
- [ ] Vendedor (PedidoForm) lista além de 20 registros.
- [ ] Auditoria "Responsável" resolve nomes de usuários além de 100.
- [ ] Auto-fill de transportadora (Cliente e Pedido) intacto.
- [ ] Edição de pedido existente mantém seleções.
- [ ] Console sem erros; Network mostra paginação `limit=100` em lotes.

## Se algo falhar
- Dropdown vazio/erro → checar resposta de `/api/<recurso>?page=1&limit=100` (shape `{data, meta}` esperado por `normalizeListResponse`).
- Loop de requisições → `meta.totalPages` ausente/errado no backend faria o laço parar em 1 (trunca) ou repetir; conferir o service correspondente.
- Regressão de tipos no edit → conferir setters que agora recebem array direto do `fetchAllPages`.
