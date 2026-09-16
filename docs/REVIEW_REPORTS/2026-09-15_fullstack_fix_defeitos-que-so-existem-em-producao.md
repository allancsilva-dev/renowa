# 2026-09-15 — Quatro defeitos que só existem em produção (layout, CSP, `.dockerignore`, payload)

**Tipo:** correção + revisão
**Área:** frontend / backend / infra / segurança
**Status final:** PASS_COM_RESSALVA

---

## Objetivo

Registrar as quatro correções desta sessão e os achados que ficaram abertos. O fio
que liga três das quatro: **o ambiente de desenvolvimento não executa o caminho onde
o defeito mora**. Layout que só quebra com volume de dado real, CSP que `vite dev`
não emite, `.dockerignore` que só atua em `docker build`. Nenhum deles seria
encontrado escrevendo mais teste unitário do jeito que os testes existem hoje.

## Escopo verificado

- Faixa "Carteira / Clientes inativos / Curva ABC" do Dashboard (layout e semântica).
- Política de CSP servida pelo nginx e seus consumidores de `blob:` no frontend.
- Contexto de build do Docker e o que ele carrega para o estágio *builder*.
- Agregador do dashboard no backend: tamanho de payload e rótulos dos KPIs.
- Workflow de CI: o que ele exercita e o que não exercita.

Fora de escopo, não olhado: `mobile/`, qualquer coisa de sync, o gerador de PDF em si.

## Arquivos lidos

- `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/Dashboard.spec.tsx`
- `frontend/security-headers.conf`, `frontend/src/nginxCsp.spec.ts`
- `frontend/src/pages/PedidoDetalhe.tsx`, `frontend/src/pages/SacDetalhe.tsx`
- `backend/src/finance/finance.service.ts`, `backend/src/products/entities/product.entity.ts`
- `.dockerignore`, `docker-compose.prod.yml`, `.github/workflows/ci.yml`
- `frontend/.env`, `README.md` (seção de autenticação web)

## Comandos executados

| Comando | Resultado |
| --- | --- |
| `npm test --workspace=frontend` | **39 arquivos, 233 passed** (era 24/157 em 2026-08-26) |
| `npm test --workspace=backend` | **59 suítes, 748 passed, 1 skipped** (era 696 em 2026-08-26) |
| `docker build --target builder` + inspeção | `/app/backend/.env` e `/app/frontend/.env` **ausentes** após a correção; presentes antes |
| requisição contra o nginx servindo a imagem | header `Content-Security-Policy` sai com `blob:` em `img-src` |

## O que foi corrigido

| ID | Assunto | Por que não aparecia em dev |
| --- | --- | --- |
| **FIX-0032** | Grid da ZONA 4 esticava os três cards à altura da Curva ABC | banco de dev pequeno, razões sociais curtas — as alturas quase coincidiam |
| **FIX-0033** | `img-src` sem `blob:` bloqueava o preview de foto | `vite dev` **não emite CSP**; a política só existe no nginx do build |
| **FIX-0034** | `.dockerignore` casava `.env` só na raiz | não há sintoma: `backend/.env` entrava no estágio builder em silêncio |
| **FIX-0035** | `clientesInativos` sem teto no payload | poucos inativos em dev; o payload cresce com o tenant |

Detalhe de cada uma, com evidência e ressalvas, em [BUGFIX_LOG.md](../BUGFIX_LOG.md).

### Três decisões que valem além destas correções

1. **O corte de `clientesInativos` foi feito no payload, não na query.** `clientesAtivos`
   é derivado de `clientesInativos.length`: um `LIMIT 20` no SQL travaria a contagem em
   20 e o donut da carteira passaria a exibir número errado. Trocaríamos payload grande
   por dado falso.
2. **`sticky` foi para as células `<th>`, não para a `<tr>`.** Safari ignora
   `position: sticky` em linha e em `<thead>`, e Safari é o navegador de referência do
   QA do projeto.
3. **`**/` no `.dockerignore` não é decorativo.** Padrão sem ele casa apenas o nível
   raiz. O mesmo vale para a negação: `!**/.env.example` precisa do prefixo para
   alcançar os exemplos dos workspaces.

### Um defeito no próprio teste, achado ao escrever o teste

O helper de `nginxCsp.spec.ts` casava a diretiva por regex sobre o arquivo **inteiro,
comentários inclusive**. O comentário recém-escrito citando `img-src` casava antes da
diretiva real — o teste validaria o texto explicativo em vez da política. Corrigido
descartando linhas de comentário antes do match. Consequência prática: até esta sessão,
comentar uma diretiva no `.conf` podia quebrar o teste que a protege.

## Achados NÃO corrigidos

| ID | Achado | Severidade / Prioridade |
| --- | --- | --- |
| [PROB-0085](../PROBLEM_LEDGER.md) | Badge da Curva ABC classifica dentro do Top 10, não sobre a carteira | MEDIUM |
| [PROB-0086](../PROBLEM_LEDGER.md) | Preview de PDF via `blob:` pode estar barrado pela CSP — **não verificado** | HIGH |
| [PROB-0087](../PROBLEM_LEDGER.md) | "Produtos ativos" conta cadastrados; "Pedidos abertos" ignora dois status | LOW |
| [PROB-0088](../PROBLEM_LEDGER.md) | `pct()` arredonda cada fatia isolada — donut pode somar 99%/101% | LOW |
| [PROB-0089](../PROBLEM_LEDGER.md) | `VITE_AUTH_*` mortas e README com o fluxo SSO antigo | LOW |
| [BACKLOG-0086](../BACKLOG.md) | Decidir semântica da Curva ABC (negócio) | P2 |
| [BACKLOG-0087](../BACKLOG.md) | CI construir as imagens e validar o nginx/CSP | P1 |
| [BACKLOG-0088](../BACKLOG.md) | Expurgar segredos de camadas/cache e rotacionar | P1 |
| [BACKLOG-0089](../BACKLOG.md) | Confirmar o preview de PDF em produção | P1 |
| [BACKLOG-0090](../BACKLOG.md) | Alinhar rótulos e percentuais do Dashboard | P2 |
| [BACKLOG-0091](../BACKLOG.md) | Remover `VITE_AUTH_*` e corrigir o README | P3 |
| [BACKLOG-0092](../BACKLOG.md) | Fixar `RENOWA_VERSION` — hoje não há artefato para rollback | P1 |

## Limites desta rodada — o que NÃO foi provado

- **Nenhuma verificação visual em produção.** FIX-0032 está travado por asserção de
  classe em **jsdom**, que não faz layout: o teste prova que a classe está lá, não que
  a altura ficou certa. O `max-h-64` é um número escolhido, não medido.
- **PROB-0086 é análise, não observação.** Está registrado justamente porque não foi
  possível verificar, e fechar por suposição custaria mais que mantê-lo aberto.
- **O passivo de FIX-0034 continua.** A correção impede dali em diante; os segredos já
  gravados em camadas intermediárias e no cache de build **não foram expurgados nem
  rotacionados**, e não se apurou se algum build com o `.dockerignore` antigo rodou em
  CI ou no host de produção (BACKLOG-0088).
- **PROB-0088 não tem caso reproduzido.** A falha é dedutível da fórmula; nenhum
  conjunto de dados que produza 101% foi construído.
- **Nada foi commitado.** Tudo no working tree do `master`.

## Recomendação final

**BACKLOG-0087 é o item de maior alavancagem desta lista**, e não porque a CSP seja o
risco maior. Três dos quatro defeitos desta sessão vivem em configuração que o
desenvolvimento nunca executa — e a suíte de testes, que hoje tem 233 casos no frontend
e 748 no backend, não toca nesses caminhos de produção. Enquanto o CI não construir a imagem e não
verificar o **header na resposta** (não o arquivo em disco: `add_header` dentro de um
location derruba todos os outros em silêncio, armadilha já documentada no próprio
`security-headers.conf`), o próximo furo de configuração chega a produção pela mesma
porta e será diagnosticado como bug de aplicação.

Em segundo lugar, **BACKLOG-0089** — custa uma abertura de console em produção e
resolve um HIGH que hoje é só suposição. Em terceiro, **BACKLOG-0088**, que envolve
janela e rotação de segredo e por isso não se resolve sozinho.

## Status final

**PASS_COM_RESSALVA.** As quatro correções estão aplicadas, com evidência de comando
para cada uma e com as duas travas de regressão confirmadas por reversão. As ressalvas
são as da seção "Limites": nenhuma verificação visual em produção, um HIGH aberto por
falta de acesso ao ambiente, o passivo de segredo em cache não saneado, e nada
commitado.
