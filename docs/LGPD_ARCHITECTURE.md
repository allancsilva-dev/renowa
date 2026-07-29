# Arquitetura LGPD

## Escopo implementado

- Backend e frontend web.
- Auditoria de leitura e alteração de PII em clientes e usuários.
- Acesso às APIs e telas LGPD exclusivo para role `ADMIN`, validado no backend.
- Solicitações de apagamento e portabilidade de clientes com state machine persistida.
- Anonimização idempotente do cliente, preservando referências de pedidos e registros financeiros.
- Portabilidade JSON entregue no momento da execução, sem persistir nova cópia de PII.
- SQLite mobile permanece fora do escopo por instrução do projeto.

## Inventário de PII

**Fonte da verdade: `backend/src/privacy/pii-registry.ts`.** Não mantenha lista de
tabelas aqui.

O inventário deixou de ser prosa em 2026-07-29 (PROB-0075). O que existia antes era
uma lista de quatro linhas que não citava `notas_fiscais`, `parceiros_comerciais`,
`transportadoras`, `pedido_fotos` nem as tabelas de SAC — e três dessas guardavam PII
de titular fora do alcance do apagamento. Uma foto de nota fiscal, com nome, CNPJ e
endereço no próprio pixel, sobrevivia intacta em `bytea` a um ERASURE concluído com
sucesso.

O registro é executável: o SQL do apagamento é **gerado** a partir dele, e
`pii-registry.spec.ts` reprova a build se alguma entidade com `tenant_id` não estiver
classificada — em `PII_REGISTRY`, com o vínculo até o titular e o que apagar em cada
coluna, ou em `TABELAS_SEM_PII`, com a justificativa de por que não guarda PII de
titular. Omitir deixou de ser silencioso.

Ao criar tabela nova com `tenant_id`, classifique-a. O teste vai cobrar.

### Limite conhecido

`parceiros_comerciais.nome_parceiro` é nome de pessoa física de um **terceiro**, que
não é `CLIENT` nem `USER`. O `lgpd_requests_subject_type_check` só aceita esses dois
tipos, então esse dado não tem tipo de titular nem caminho de solicitação. Está
declarado em `TABELAS_SEM_PII` com essa ressalva explícita, não como isenção. Ver
PROB-0076.

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
