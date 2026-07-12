# Product

## Register

product

## Platform

web

## Users

Dois perfis primários, mesmo painel multi-tenant (tenant #1 = Renowa Representações):

- **Representantes / vendedores** — cadastram clientes, lançam pedidos, acompanham produtos e comissões. Muitas vezes fora do escritório (em visita, em campo). Não são usuários técnicos; querem terminar a tarefa e sair.
- **Admin / back-office** — gestão interna: catálogo de produtos, financeiro, transporte, configuração do tenant. Uso mais prolongado e recorrente.

Trabalho a ser feito: registrar e acompanhar a operação comercial (clientes → pedidos → produtos → transporte → financeiro) sem atrito, com confiança de que o dado está certo.

## Product Purpose

SaaS multi-tenant de gestão para representações comerciais. Centraliza clientes, pedidos, produtos, transporte e financeiro num só painel web, sincronizado com o app mobile de campo. Sucesso = o representante lança um pedido em segundos e confia no número; o back-office fecha o financeiro sem planilha paralela. Produto é vendido a terceiros — a interface precisa sustentar a cobrança.

## Brand Personality

Sóbria, confiável, profissional. Ferramenta de trabalho séria, não um brinquedo de SaaS. Voz direta e sem jargão — o usuário não é técnico. O teal (#2A9D8F) carrega estabilidade e calma; a calidez vem do tom próximo da copy, não de cor lúdica. Confiança se mostra na precisão e na consistência, não em enfeite.

## Anti-references

- **Sistema legado / ERP anos 2000** — tabelas cinza densas, botões 3D, menus infinitos, cara de sistema fiscal antigo. O maior inimigo: o usuário não pode sentir que "voltou pro sistema velho".
- **SaaS genérico / template de IA** — gradiente roxo, hero-metric, cards idênticos ícone+título repetidos, eyebrow tracked em toda seção, marcadores numerados 01/02/03. Se parece "IA fez", falhou.
- **Frio / corporativo demais** — azul-marinho bancário, rígido, sem nenhuma calidez.

## Design Principles

1. **Clareza acima de densidade.** Usuário não-técnico, muitas vezes em campo. Uma tela óbvia com menos erros vale mais que caber tudo. Densidade só onde a tarefa exige (tabelas operacionais).
2. **Confiança sóbria.** Parecer sólido e à altura de cobrar — sem recorrer a enfeite. Espaço, tipografia e consistência fazem o trabalho que gradiente e sombra fingem fazer.
3. **Nem legado, nem template.** Fugir dos dois reflexos: nada de ERP cinza dos anos 2000, nada de SaaS-slop genérico. A identidade é o teal Renowa aplicado com intenção.
4. **Baixa fricção na tarefa repetida.** O caminho de lançar cliente/pedido é o mais percorrido — cortá-lo curto, com estados de erro e vazio que orientam em vez de bloquear.
5. **Acessível por padrão.** WCAG AA não é etapa posterior: contraste, foco visível, teclado e reduced-motion entram desde o primeiro componente.

## Accessibility & Inclusion

Meta WCAG 2.1 AA. Texto corpo ≥4.5:1, texto grande ≥3:1, placeholders no mesmo 4.5:1. Foco visível em todo elemento interativo, navegação completa por teclado (formulários de pedido/cliente são o caminho crítico). `prefers-reduced-motion` respeitado em toda animação. Considerar usuários mais velhos e uso sob luz forte (campo): não confiar em cinza-claro "elegante" para texto.
