# BUGFIX_LOG — Renowa

Registro de bugs corrigidos. Mantido pelo `docs-reporter`. IDs `BUG-NNNN`. Referência cruzada com [PROBLEM_LEDGER.md](PROBLEM_LEDGER.md) por ID.

## Formato de entrada

```
### BUG-NNNN — <título>
- **Problema relacionado:** PROB-NNNN (ou "—")
- **Data:** YYYY-MM-DD
- **Área:** backend | frontend | banco | segurança | LGPD | mobile | documentação | infra
- **Sintoma:** ...
- **Causa raiz:** ...
- **Correção aplicada:** ...
- **Arquivos alterados:** `caminho:linha`
- **Testes/validações executadas:** comando + resultado real
- **Resultado:** PASS | PASS_COM_RESSALVA | FAIL | NÃO_EXECUTADO
- **Ressalvas:** ...
- **Commit:** <hash> (ou "commit: pendente")
```

---

## Bugs corrigidos

### BUG-0001 — Corrigida referência pendente `software-engineer` no software-architect
- **Problema relacionado:** PROB-0001
- **Data:** 2026-07-08
- **Área:** documentação
- **Sintoma:** `software-architect.md` delegava a `software-engineer` (agente inexistente).
- **Causa raiz:** referência não atualizada após remoção do agente genérico.
- **Correção aplicada:** 3 referências reescritas para o engenheiro de domínio (`backend-engineer` / `frontend-engineer` / `mobile-engineer` / `database-engineer`).
- **Arquivos alterados:** `.claude/agents/software-architect.md:8`, `:62`, `:70`
- **Testes/validações executadas:** `grep -n software-engineer .claude/agents/` → 0 ocorrências após o fix.
- **Resultado:** PASS
- **Ressalvas:** nenhuma. Alteração restrita a arquivo de agente; nenhum código de aplicação tocado.
- **Commit:** pendente
