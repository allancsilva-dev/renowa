# REVIEW_REPORTS — Renowa

Relatórios de revisão, auditoria e diagnóstico. Mantido pelo `docs-reporter`.

## Convenção de nome

`YYYY-MM-DD_area_tipo_titulo.md`

- **area:** backend | frontend | banco | security | lgpd | mobile | docs | infra
- **tipo:** review | audit | diagnostico

Exemplos:
- `2026-06-30_backend_review_auth-flow.md`
- `2026-06-30_security_audit_jwt-tenant-isolation.md`
- `2026-06-30_frontend_review_api-client.md`

## Conteúdo de cada relatório

- Objetivo
- Escopo verificado
- Arquivos lidos
- Comandos executados
- Achados (com severidade)
- O que foi corrigido
- O que ficou pendente
- Recomendação final
- Status final: PASS | PASS_COM_RESSALVA | FAIL | NÃO_EXECUTADO
