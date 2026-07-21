# MetaRenowa — integração P0 e pedido para validação

Atualizado em 21/07/2026. Este documento consolida a análise funcional e registra o contrato implementado. O workspace `mobile` não faz parte desta entrega.

## Inventário analisado

| Grupo | Artefatos | Uso na decisão |
| --- | --- | --- |
| Atas e relatos | `docs/Renowa/Reuniões/2026-02-25 15-17-37.txt`, `WhatsApp Audio 2026-02-25 at 17.38.37.txt` e mídia `WhatsApp Ptt 2026-02-25 at 19.18.48.mp4` | Fluxo operacional, campos e validação manual |
| Requisitos e arquitetura | `Sistema Renowa Requisitos.docx/.pdf`, `Renowa Arquitetura Tecnica.pdf`, `Renowa_Arquitetura_Tecnica.docx`, `IA/renowa_prompt_claude_code_v3.md` | Entidades, perfis e limites do sistema |
| Planilhas | `PAPEL PEDIDO RENOWA.xlsx`, `CONTROLE RENOWA GERAL - BASE.xlsx`, `PAINEL DE CONTROLE RENOWA - BASE.xlsx`, `vendas_limpas.csv`, `combined_sales_data.csv` | Fórmulas, pedido e referências financeiras |
| Referências visuais | `Produto/Modelo*.jpeg`, `Produto/Design do Sistema Opção 1–3.png`, `Tecnico/Planilha de pedido.jpeg`, logos em `docs/Renowa/Logo/` | Hierarquia visual e conteúdo do documento |
| Identidade usada | `frontend/public/assets/logo-renowa.png` | Logo colorida transparente para papel branco |

## Evidência das fórmulas do Excel

As fórmulas foram extraídas diretamente de `xl/worksheets/*.xml` em `PAPEL PEDIDO RENOWA.xlsx`:

| Célula/faixa | Fórmula OOXML | Contrato resultante |
| --- | --- | --- |
| `H19` e compartilhada em `H20:H88` | `F19*G19` | caixas × unidades por caixa |
| `K19` e compartilhada em `K20:K88` | `I19*(1-J19)` | preço × (1 − desconto) |
| `M19` e compartilhada em `M20:M88` | `K19*(1+L19)` | valor com desconto × (1 + IPI) |
| `O19` e compartilhada em `O20:O88` | `K19*H19` | quantidade total × valor com desconto |
| Total | `SUM(O19:P88)` | soma dos totais dos itens |

O arquivo também usa `TODAY()` para emissão. As planilhas de controle contêm fórmulas de comissão como `G3*5%`, `I4*5%`, `AW4*2.5%` e somatórios por período; essas regras financeiras permanecem P1 e não foram incorporadas ao pedido.

## Matriz de atendimento

| Capacidade | Backend | Frontend | Evidência/observação |
| --- | --- | --- | --- |
| Cálculo único com Decimal e HALF_UP | Atende | Atende | `order-calculation.ts`; frontend somente apresenta prévia |
| Rejeição de totais do navegador | Atende | Atende | DTO não declara totais e o `ValidationPipe` usa `forbidNonWhitelisted` |
| Quantidade, desconto, IPI e totais persistidos | Atende | Atende | migration `0024`; detalhe/PDF leem campos persistidos |
| Criação transacional | Atende | Atende | cabeçalho, itens e totais na mesma transação |
| `PUT` completo, versionado e transacional | Atende | Atende | conflito 409, soft delete de omitidos e validação de UUID |
| Isolamento por tenant/vendedor | Atende | Atende | referências resolvidas no tenant e vendedor restrito associado automaticamente |
| Cliente por razão/CNPJ e autopreenchimento | Atende | Atende | busca paginada; pagamento, prazo, transporte e entrega copiados |
| Fornecedor e catálogo filtrado | Atende | Atende | filtro `fornecedor_uuid` e validação server-side do vínculo |
| Produto cadastrado ou manual | Atende | Atende | produto opcional; código/descrição manuais aceitos |
| Cliente: IE, SUFRAMA e transportadora | Atende | Atende | edição permite vincular, trocar ou remover transportadora |
| Transportadora editar/excluir | Atende | Atende | endpoints existentes expostos na tabela web |
| Produto trocar fornecedor | Atende | Atende | update resolve novo fornecedor no tenant |
| Listagem por cliente/CNPJ/número | Atende | Atende | join de cliente e busca única |
| PDF de validação | Atende | Atende | A4 retrato, dados persistidos, itens, totais, aceite e rodapé |
| Smoke real com banco e navegador | Atende | Atende | criação, edição, reabertura, valores e PDF conferidos no ambiente local autenticado |
| Sintegra e financeiro avançado | Não atende (P1) | Não atende (P1) | fora do P0 confirmado |

## Contrato definitivo de cálculo

- `qtd_total = qtd_caixas × qtd_unitaria`
- `valor_com_desconto = preco_unitario × (1 − desconto/100)`
- `valor_com_imposto = valor_com_desconto × (1 + IPI/100)`
- `total_item_sem_imposto = qtd_total × valor_com_desconto`
- `total_item_com_imposto = qtd_total × valor_com_imposto`
- Totais do pedido são somas dos itens.
- Quantidades usam 3 casas; dinheiro e percentuais, 2 casas; arredondamento `ROUND_HALF_UP`.
- O IPI é opcional por item. Quando não informado, permanece `NULL`, não altera o valor e aparece como “—” no PDF.
- O backend é a autoridade. Totais presentes no payload são rejeitados.
- Registros históricos não são alterados; `backend/src/database/audits/order_calculation_divergences.sql` lista divergências.

Referência de aceite: 3 caixas × 10 unidades × R$ 100,00, desconto 10% e IPI 5% = 30 unidades, R$ 90,00 unitário líquido, R$ 94,50 com imposto, R$ 2.700,00 sem imposto e R$ 2.835,00 com imposto.

## Dependências e ordem de implementação

1. Migration e entidades.
2. Cálculo puro e testes de referência.
3. Criação e substituição transacionais.
4. Correções de cadastros e filtros.
5. Formulário único e detalhe persistido.
6. PDF via `@react-pdf/renderer`.
7. Lint, build, testes e smoke quando houver infraestrutura.

Critérios de aceite: nenhum total aceito do cliente; transação integral em falha; `version` obrigatório no update; item omitido recebe soft delete; referência fora do tenant/pedido aborta; vendedor restrito não escolhe outro vendedor; tela, API, banco e PDF exibem os mesmos campos persistidos.

## Especificação do PDF

O documento é A4 retrato, com logo colorida transparente, título “PEDIDO PARA VALIDAÇÃO”, selo “AGUARDANDO VALIDAÇÃO” e aviso não fiscal. Apresenta número/data, vendedor, fornecedor, cliente, CNPJ, endereço, IE, SUFRAMA, contatos, transporte, entrega, pagamento, prazo, faturamento e observações.

A tabela usa divisores suaves e contém item, código, descrição quebrável, `caixas × unidades = total`, preço tabela, desconto, IPI e totais com/sem imposto. Linhas não são cortadas entre páginas e o cabeçalho se repete nas páginas de itens. O resumo mostra bruto, desconto, sem imposto, IPI e total final. Uma página final exclusiva contém conferência, opções de aprovação/ajuste, observações, responsável, assinatura e data. Rodapé informa pedido, página X de Y, geração e aviso não fiscal.

O botão no detalhe busca novamente o pedido persistido antes de renderizar, abre a visualização e baixa `pedido-validacao-renowa-{numero}.pdf`. A edição ocorre em rota separada; portanto não existe geração a partir de alterações locais não salvas.

Referências conceituais: [HubSpot](https://www.hubspot.com/resources/templates/price-quote), [Osmos](https://www.osmoscloud.com/free-quote-template) e [Smartsheet](https://www.smartsheet.com/price-quote-templates). Nenhum template foi copiado.

## P1 mantido

- Sintegra.
- Aprovação digital no sistema, assinatura eletrônica e envio direto por WhatsApp/e-mail.
- Vendedor por empresa, comissão calculada no servidor, cliente obrigatório na inadimplência e parceria 50/50 formalizada.

## Checklist de validação

- [x] Inventário e fórmulas documentados.
- [x] Migration e relatório histórico criados.
- [x] Cálculo server-side e fórmula de referência testados em unidade.
- [x] Criação/edição transacionais implementadas.
- [x] Fluxos web e cadastros integrados.
- [x] PDF implementado a partir do pedido persistido.
- [x] Backend: lint, build e suíte completa (33 suítes, 185 testes).
- [x] Frontend: lint, build e testes (2 arquivos, 4 testes).
- [x] Smoke real autenticado com PostgreSQL: criação e `PUT`, reabertura com 30 unidades / R$ 2.700,00 / R$ 2.835,00, PDF real e stress de renderização com 10 e 70 itens. A orientação foi posteriormente alterada para A4 retrato conforme validação do usuário.

Ressalva ambiental: o banco local legado possui tabelas anteriores sem o baseline correspondente em `schema_migrations`; por isso o runner completo tentou reaplicar `001_initial_schema.sql` e parou em “relation clientes already exists”. Para o smoke foi aplicada isoladamente a migration idempotente `0024`. O problema de baseline é preexistente e precisa ser saneado antes de usar esse banco como ensaio integral do runner de produção.
