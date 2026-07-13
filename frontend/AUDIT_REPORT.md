# Auditoria do frontend

Atualizado em 2026-07-13. Este arquivo permite continuar o trabalho em outro chat.

## Corrigido

- Contratos de criação agora enviam UUID v4 para clientes, produtos, pedidos e transportadoras.
- Pedido usa `cliente_uuid` e seleção de cliente, compatível com API.
- Edição de cliente/produto desembrulha `{ data: entidade }` corretamente.
- Dashboard fictício removido. Página usa `/financeiro/dashboard` e respeita permissão.
- Chunk do Dashboard caiu de 442,96 kB para cerca de 6,2 kB.
- Erros financeiros deixam de aparecer como zero/ausência silenciosa.
- Paginação de usuários e roles não volta automaticamente à página 1.
- Modais principais usam `<dialog>`, Escape e gerenciamento nativo de foco.
- Formulários operacionais receberam associação entre labels e campos.
- Sidebar virou drawer responsivo; tabelas permitem rolagem horizontal.
- Contraste primário passou a usar teal escuro em superfícies com texto branco.
- `prefers-reduced-motion` e alvos de toque foram adicionados ao sistema.
- CSP permite ViaCEP; Google Fonts externas foram removidas.
- Requisições paginadas antigas não sobrescrevem respostas recentes.
- Dependências sem uso foram removidas; Recharts saiu após simplificação do Dashboard.
- Vitest configurado com testes para UUID, autorização e paginação.

## Pendente / risco conhecido

- `Financeiro.tsx` ainda é monolítico e deve ser dividido por aba.
- Alguns controles secundários ainda podem precisar de revisão manual com leitor de tela.
- Busca e notificações do header estão explicitamente desativadas até existirem endpoints.
- `npm audit` mantém 1 vulnerabilidade high em `glob`, transitiva de ferramentas de desenvolvimento (`eslint`/`tailwindcss`), sem uso no bundle de produção.
- Testes E2E dos fluxos com backend real ainda não existem.
- Validação visual em iPhone, Android e tablet real ainda é necessária.

## Validação mais recente

- `npm run lint --workspace=frontend`
- `npm run test --workspace=frontend`
- `npm run build --workspace=frontend`
- `npm audit --workspace=frontend --omit=dev --audit-level=moderate`

Consulte histórico Git e rode novamente os comandos acima antes de concluir novas alterações.
