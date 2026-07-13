# Arquitetura LGPD

## Escopo implementado

- Backend e frontend web.
- Auditoria de leitura e alteração de PII em clientes e usuários.
- Acesso às APIs e telas LGPD exclusivo para role `ADMIN`, validado no backend.
- Solicitações de apagamento e portabilidade de clientes com state machine persistida.
- Anonimização idempotente do cliente, preservando referências de pedidos e registros financeiros.
- Portabilidade JSON entregue no momento da execução, sem persistir nova cópia de PII.
- SQLite mobile permanece fora do escopo por instrução do projeto.

## Inventário inicial de PII

- `clientes`: razão social, CNPJ, e-mail, telefone, endereço, contato, inscrições e observações.
- `usuarios` / `local_users`: nome, e-mail, identificador de autenticação e status.
- `pedidos`: local de entrega e observações podem conter PII livre; exigem futura classificação/restrição de conteúdo.
- Audit log: identificadores técnicos e nomes de campos; valores de PII são proibidos.

## ADR-001 — Audit log append-only

Eventos ficam em `pii_audit_events`, isolados por tenant. Alterações de PII e respectivo evento usam a mesma transação. Consultas geram evento após leitura bem-sucedida. Tabela não possui API de update/delete e migration revoga essas operações de `PUBLIC`.

Decisão: instrumentação explícita no service layer. Interceptor HTTP genérico não conhece finalidade, campos retornados nem transações de negócio.

## ADR-002 — Apagamento por anonimização

Cliente pode estar referenciado por pedidos, comissões e registros contábeis. Hard-delete quebraria integridade e retenção legal. Execução substitui nome por marcador não identificável, remove PII opcional, incrementa versão e aplica tombstone via `deleted_at`. Referências técnicas permanecem.

Hard-delete só poderá ser adicionado após matriz jurídica confirmar ausência de obrigação e grafo de dependências permitir exclusão segura.

## ADR-003 — State machine de direitos

Estados: `RECEIVED`, `IDENTITY_VERIFIED`, `APPROVED`, `IN_PROGRESS`, `COMPLETED`, `DENIED`, `FAILED`.

- Transições inválidas retornam conflito.
- Uma solicitação ativa por titular/tipo/tenant.
- Execução usa lock pessimista e aceita repetição após conclusão.
- Aprovação exige texto de base legal/decisão.
- Admin não executa solicitação antes de validação e aprovação.

## ADR-004 — Portabilidade

Exportação usa JSON estruturado e snapshot transacional do cliente. PII é devolvida inline somente ao Admin executor e baixada localmente pelo navegador. Banco persiste apenas manifesto sem PII: formato, horário e modo de entrega.

## Decisões jurídicas pendentes

- Prazos de atendimento e retenção por categoria documental.
- Critérios de validação de identidade do titular.
- Política de legal hold e autoridade aprovadora.
- Prazo de retenção e acesso operacional do audit log.
- Conteúdo de pedidos, financeiro e backups que deve ser retido ou anonimizado.
- Escopo exigido para portabilidade além do cadastro do cliente.

Esses valores não foram codificados. Devem virar política versionada após aprovação jurídica.

## PROB-0030 — plano bloqueado

PII em SQLite existe no workspace mobile. Solução requer SQLCipher, chave por instalação protegida por Keychain/Keystore, migração transacional, rotação, logout e testes de upgrade/recuperação. Nenhum arquivo mobile foi alterado.
