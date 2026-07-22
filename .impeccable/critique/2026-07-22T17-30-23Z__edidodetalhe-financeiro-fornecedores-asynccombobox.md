---
target: "frontend: Fluxo Comercial Completo (Faturamento, PedidoForm, Produtos, Financeiro, AsyncCombobox)"
total_score: 23
p0_count: 0
p1_count: 4
timestamp: 2026-07-22T17-30-23Z
slug: edidodetalhe-financeiro-fornecedores-asynccombobox
---
## Design Health Score

| # | Heurística | Nota | Achado-chave |
|---|---|---|---|
| 1 | Visibilidade de status | 3 | Ações críticas (liberar/cancelar/pagar) fecham silenciosamente |
| 2 | Correspondência sistema/mundo real | 3 | Ícone Unlock em "Liberar pedido" comunica o oposto do efeito real |
| 3 | Controle e liberdade | 3 | Sem caminho de volta após liberar; exclusões usam confirm() nativo |
| 4 | Consistência e padrões | 1 | Financeiro.tsx reimplementa 6 tabelas fora do DataTable; 3 tons de teal |
| 5 | Prevenção de erros | 2 | Trocar fornecedor apaga itens sem aviso; liberar sem confirmação |
| 6 | Reconhecimento vs memorização | 3 | Combobox bom, mas convive com select simples no mesmo form |
| 7 | Flexibilidade e eficiência | 2 | Zero ações em lote; filtro de mês/ano não persiste |
| 8 | Estética minimalista | 2 | Emoji como ícone; 3 paletas de cabeçalho de tabela; cores fora da paleta |
| 9 | Recuperação de erros | 3 | writeErrorMessage trata concorrência otimista bem; CNPJ 404/503 |
| 10 | Ajuda e documentação | 1 | Nenhuma ajuda contextual |
| **Total** | | **23/40** | **Aceitável** |

## Anti-Patterns Verdict
LLM: emoji substituindo Lucide em Financeiro.tsx; 3 tratamentos de cabeçalho de tabela coexistindo.
Detector: 5 findings gray-on-color, todos falso-positivo (hover: prefix não checado pela regra).
Overlays: não disponíveis (sem sessão autenticada automatizável).

## Priority Issues
[P1] Financeiro.tsx abandona DataTable em 6 tabelas.
[P1] Emoji como iconografia em Financeiro.tsx.
[P1] Cores fora da paleta + teal triplicado (bg-teal-600, #2A9D8F hex, primary token).
[P1] "Liberar pedido" irreversível sem confirmação, ícone Unlock invertido.
[P2] Trocar fornecedor no pedido apaga itens silenciosamente (PedidoForm.tsx:247).

## Persona Red Flags
Alex: sem ações em lote; aba de Financeiro não persiste em URL/refresh.
Sam: confirm() nativo em vez de Dialog acessível; alvos de toque inconsistentes (36px vs 44px); LoadingState não usado em 4 formulários principais.
Marcos (persona do produto): sem autosave; perda silenciosa de itens ao trocar fornecedor; erro de validação não aponta o item.

## Minor Observations
ProdutoForm.tsx usa input number em vez de InputMoney; AsyncCombobox mistura com select simples no mesmo form; position:absolute do combobox não testado em contexto de modal mais alto; label eyebrow reutilizado para título e campo (herdado, pré-existente).
