---
name: Renowa
description: Painel web multi-tenant de gestão para representações comerciais — "The Calm Operator".
colors:
  primary: "#2A9D8F"
  primary-hover: "#238a7d"
  primary-tint: "#e6f5f3"
  sidebar-deep: "#0D2B2B"
  sidebar-gradient-start: "#0F4F54"
  sidebar-gradient-end: "#1A6A70"
  background: "#F4F7F6"
  surface: "#FFFFFF"
  ink: "#111111"
  ink-secondary: "#6B7280"
  border: "#E2E8F0"
  muted-fg: "#64748B"
  success: "#10B981"
  danger: "#EF4444"
  chart-orange: "#F4A261"
  chart-coral: "#E76F51"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  table-header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  nav-item-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
---

# Design System: Renowa

## 1. Overview

**Creative North Star: "The Calm Operator"**

Renowa é uma sala de controle silenciosa. O painel é claro e arejado; a barra lateral em teal profundo ancora a marca sem competir com o conteúdo; as tabelas são nítidas e o dado está sempre em foco. A confiança vem da ordem — espaço, alinhamento e consistência — não de brilho, gradiente decorativo ou sombra dramática. Um representante não-técnico, muitas vezes em campo, precisa terminar a tarefa e confiar no número. A interface serve esse trabalho e desaparece.

O teal Renowa (#2A9D8F) é o único acento com voz. Ele marca ação, estado ativo e cabeçalhos de tabela — e apenas isso. Todo o resto é neutro disciplinado: fundo off-white, superfícies brancas, tinta quase preta para texto. A calidez da marca é carregada pela cor teal e pelo tom próximo da copy, nunca por um fundo bege "acolhedor" nem por enfeite.

Este sistema rejeita explicitamente dois reflexos: o **ERP dos anos 2000** (tabelas cinza densas, botões 3D, menus infinitos) e o **SaaS-slop genérico** (gradiente roxo, hero-metric, cards idênticos ícone+título, eyebrow tracked em toda seção, marcadores 01/02/03). Se a tela parece qualquer um dos dois, está errada.

**Key Characteristics:**
- Painel claro (#F4F7F6) + sidebar teal profunda: contraste de âncora, não de decoração.
- Um único acento (teal) com uso disciplinado; neutros carregam o resto.
- Superfícies planas por padrão; profundidade só por borda fina + sombra sutil.
- Densidade honesta nas tabelas, respiro generoso no chrome.
- Inter em pesos variados como toda a hierarquia — sem segunda família.

## 2. Colors

Paleta de um só acento: teal Renowa sobre neutros frios, com verde/vermelho semânticos e dois tons quentes reservados exclusivamente para gráficos.

### Primary
- **Teal Renowa** (#2A9D8F): a assinatura. Botões de ação, estado ativo da navegação, cabeçalho de tabela, foco de input, avatar. Hover escurece para **Teal Fundo** (#238a7d). O tint **Teal Névoa** (#e6f5f3) para realces muito suaves (linha selecionada, badge leve).
- **Teal Profundo** (#0D2B2B) e o gradiente da sidebar (#0F4F54 → #1A6A70): fundo da barra lateral. É a única superfície escura do produto; ancora a marca e separa navegação de conteúdo.

### Neutral
- **Off-white Renowa** (#F4F7F6): fundo de toda a área de trabalho. Nunca branco puro no body — o branco é reservado às superfícies elevadas.
- **Superfície** (#FFFFFF): cards, tabelas, header, inputs. O que "flutua" sobre o off-white.
- **Tinta** (#111111): texto primário, títulos, valores.
- **Tinta Secundária** (#6B7280) / **Muted** (#64748B): rótulos, metadados, paginação, placeholders — sempre validados a ≥4.5:1.
- **Borda** (#E2E8F0): divisores de tabela, contorno de card e input. Fina, 1px, sempre completa.

### Tertiary (semânticos + gráficos)
- **Sucesso** (#10B981) / **Perigo** (#EF4444): confirmação e erro/destrutivo. Badge de notificação usa o vermelho.
- **Laranja Gráfico** (#F4A261) / **Coral Gráfico** (#E76F51): **exclusivos de Recharts**. Nunca em UI de chrome, botão ou texto.

### Named Rules
**The One Teal Rule.** O teal é o único acento com voz na tela. Aparece em ação, estado ativo e cabeçalho de tabela — em ≤10% de qualquer superfície. A raridade é o ponto: se tudo é teal, nada é.

**The Chart-Only Warm Rule.** Laranja e coral existem só dentro de gráficos. Fora de um `<Recharts>`, são proibidos.

## 3. Typography

**Display / Body / Label Font:** Inter (com fallback `system-ui, sans-serif`), pesos 400/500/600/700 via Google Fonts.

**Character:** Uma família, toda a hierarquia. Inter é neutra, altamente legível em tamanhos pequenos e telas de campo — a escolha certa para um sistema que prioriza clareza. Contraste vem de peso e tamanho, nunca de uma segunda família.

### Hierarchy
- **Display** (700, 1.875rem/30px, lh 1.2, -0.01em): título de página / cabeçalho de módulo.
- **Headline** (600, 1.5rem/24px, lh 1.25): seções dentro de uma página, título de dialog.
- **Title** (600, 1.125rem/18px, lh 1.4): título de card, subtítulo de seção.
- **Body** (400, 0.875rem/14px, lh 1.5): texto base do produto — células de tabela, formulários, descrições. Máx. 65–75ch em prosa.
- **Label** (500, 0.75rem/12px, lh 1.4): rótulos de campo, metadados, texto de botão, badges.

### Named Rules
**The One Family Rule.** Inter carrega tudo. Nenhuma segunda fonte entra sem uma decisão explícita de design director. Hierarquia = peso + tamanho.

**The No-Gray-Body Rule.** Texto de leitura nunca cai abaixo de 4.5:1. Cinza-claro "elegante" para corpo é proibido — o usuário lê sob sol.

## 4. Elevation

Sistema plano por padrão. Profundidade é comunicada por **borda fina (1px, #E2E8F0) + sombra sutil**, não por camadas empilhadas nem blur. Cards, tabelas e header usam `shadow-sm` — o suficiente para descolar a superfície branca do fundo off-white, nunca o bastante para chamar atenção. Sem glassmorphism, sem sombra colorida, sem elevação decorativa.

### Shadow Vocabulary
- **Superfície em repouso** (`box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05)`): cards, tabelas, header. O padrão `shadow-sm`.
- **Sidebar** (`box-shadow: 4px 0 10px rgba(0,0,0,0.1)`): sombra lateral única que separa a barra teal do conteúdo.

### Named Rules
**The Flat-By-Default Rule.** Superfícies são planas em repouso. Sombra é resposta a estado (a borda de foco, o hover de linha), não decoração permanente. Se a sombra é visível de longe, está forte demais.

## 5. Components

Filosofia: **refinado e contido**. Cantos suaves (8px), sombra mínima, estados discretos. Nada chama atenção à toa; a presença vem da consistência.

### Buttons
- **Shape:** cantos suaves de 8px (`rounded-lg`).
- **Primary:** fundo Teal Renowa (#2A9D8F), texto branco, `padding: 8px 16px`, peso 500, 14px. Ícone Lucide 16–20px opcional com `gap: 8px`.
- **Hover / Focus:** fundo escurece para #238a7d (`primary-600`), `transition: colors`. Foco visível obrigatório (anel teal).
- **Disabled:** `opacity: 0.6`, cursor não permitido.
- **Icon button (chrome):** quadrado, `rounded-md`/`rounded-full`, texto slate-500, hover `bg-slate-100`. Usado no header (menu, sino) e paginação.

### Cards / Containers
- **Corner Style:** 8px (`rounded-lg`).
- **Background:** branco (#FFFFFF) sobre o off-white.
- **Shadow Strategy:** `shadow-sm` em repouso (ver Elevation).
- **Border:** 1px #E2E8F0, sempre completa. **Nunca** faixa lateral colorida.
- **Internal Padding:** 16px.

### Inputs / Fields
- **Style:** fundo branco (ou `bg-slate-50` na busca do header), borda 1px slate-200, `rounded-lg` (busca usa `rounded-full`), texto tinta, 14px.
- **Focus:** borda vira teal + anel de 1px teal (`ring-1 ring-primary-500`), sem outline default.
- **Placeholder:** slate-400, validado ≥4.5:1.
- **Error:** borda e mensagem em Perigo (#EF4444).

### Navigation (Sidebar)
- **Style:** barra de 260px, fundo teal profundo em gradiente (#0F4F54 → #1A6A70), logo branca no topo.
- **Itens:** 14px peso 500, ícone Lucide 20px + rótulo, `padding: 12px 16px`, `rounded: 10px`. Repouso: texto branco a 70%.
- **Hover:** texto branco 100%, fundo `#E8ECEB`.
- **Active:** fundo off-white (#F4F7F6), texto Teal Renovo (#2A9D8F) — o item ativo "acende" claro contra a barra escura.

### Data Table (signature)
- Contêiner branco `rounded-lg` com borda e `shadow-sm`, `overflow-hidden`.
- **Header:** linha `bg-primary` teal, texto branco, `font-semibold`, células `px-4 py-3`, alinhadas à esquerda.
- **Linhas:** `border-b` slate, hover `bg-slate-50`, `transition-colors`. Última linha sem borda.
- **Loading:** skeleton `animate-pulse` com barras `bg-slate-200`.
- **Empty:** contêiner tracejado, ícone slate-300, título slate-700, descrição slate-500 — orienta em vez de bloquear.
- **Paginação:** texto slate-600, botões prev/next com `disabled:opacity-40`.

## 6. Do's and Don'ts

### Do:
- **Do** usar o teal (#2A9D8F) só em ação, estado ativo e cabeçalho de tabela — ≤10% da tela (The One Teal Rule).
- **Do** manter o body em #F4F7F6 e reservar o branco para superfícies elevadas (card, tabela, header, input).
- **Do** comunicar profundidade com borda 1px #E2E8F0 + `shadow-sm`, nunca com blur ou sombra colorida.
- **Do** usar Inter em pesos variados para toda hierarquia; contraste por peso e tamanho.
- **Do** garantir ≥4.5:1 em todo texto de leitura, inclusive placeholders — o usuário lê sob sol (The No-Gray-Body Rule).
- **Do** dar a todo campo e botão foco visível (anel teal) e operação completa por teclado.
- **Do** deixar laranja/coral apenas dentro de gráficos Recharts.

### Don't:
- **Don't** parecer ERP dos anos 2000: nada de tabelas cinza densas, botões 3D, menus infinitos.
- **Don't** cair no SaaS-slop: sem gradiente roxo, sem hero-metric, sem cards idênticos ícone+título repetidos, sem eyebrow tracked em toda seção, sem marcadores 01/02/03.
- **Don't** usar `border-left`/`border-right` >1px como faixa colorida em card, alerta ou lista.
- **Don't** aplicar gradiente em texto (`background-clip: text`) nem glassmorphism decorativo.
- **Don't** pintar um segundo acento além do teal na UI; laranja e coral são só de gráfico (The Chart-Only Warm Rule).
- **Don't** usar cinza-claro para texto de corpo "por elegância" — reprova o contraste.
- **Don't** introduzir uma segunda família de fonte sem decisão explícita.
