# CSVs de exemplo — importação em massa

Arquivos-modelo para a importação por `.csv` de cada entidade.

| Arquivo | Tela | Endpoint |
|---|---|---|
| `produtos.csv` | Produtos | `POST /produtos/importacao` (exige selecionar o fornecedor na tela) |
| `fornecedores.csv` | Fornecedores | `POST /fornecedores/importacao` |
| `transporte.csv` | Transporte | `POST /transportadoras/importacao` |
| `clientes.csv` | Clientes | `POST /clientes/importacao` |

## Convenções

- **Separador:** `;` (ponto-e-vírgula) — padrão do "CSV (separado por vírgulas)" do Excel pt-BR. O sistema também aceita `,`, mas `;` evita conflito com a vírgula decimal e com endereços que contêm vírgula.
- **Encoding:** UTF-8. No Excel use **Arquivo → Salvar como → CSV UTF-8**.
- **Cabeçalho obrigatório:** a 1ª linha nomeia as colunas. `razao_social` (ou `codigo` em produtos) é obrigatório; as demais são opcionais.
- **Chave de atualização:** registros com o mesmo **CNPJ** já existentes no tenant são **atualizados** (não duplicados). Produtos usam `codigo` dentro do fornecedor.
- **Limite:** 5.000 linhas por arquivo.

## Ordem recomendada

Importe **Transporte antes de Clientes**: em `clientes.csv` a coluna `transportadora_cnpj` vincula o cliente a uma transportadora existente. CNPJ não encontrado → o campo fica nulo e a linha **não** é rejeitada (ver as duas últimas linhas do arquivo de clientes).

## Comportamento demonstrado nos exemplos

- `produtos.csv`: preços em pt-BR (`0,85`, `1.234,56`) e en-US.
- `clientes.csv`: linha sem CNPJ (sempre criada), transportadora vinculada por CNPJ e transportadora inexistente (fica nula).
