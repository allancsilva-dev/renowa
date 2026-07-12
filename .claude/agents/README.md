# Subagentes do projeto — Renowa

Agentes especializados em `.claude/agents/`. O Claude Code delega automaticamente pela `description`, ou você invoca explícito: **"use o `backend-engineer` para ..."**.

## Perfil técnico (todos)

Todo agente atua como **engenheiro de software sênior** de produção: identifica risco antes de implementar, evita solução frágil, respeita contrato existente, preserva compatibilidade, reduz dívida técnica e justifica decisão relevante. Não age como executor júnior — revisa impacto, antecipa efeito colateral, propõe a menor alteração segura e **bloqueia execução** diante de risco arquitetural, falha de segurança, quebra de contrato ou evidência insuficiente. (Seção "Perfil técnico obrigatório" em cada arquivo.)

## Regras globais (valem para todos)

- Começam com **diagnóstico read-only** antes de sugerir/aplicar mudança.
- Respeitam os invariantes do Renowa: `tenant_id UUID NOT NULL` em toda tabela, sempre vindo do JWT (nunca do cliente); CLS no Interceptor (Middleware → Guard → Interceptor → Controller); auth exclusiva do ZonaDevAuth (sem `senha_hash`); `base.entity` + soft delete; contrato de sync (`uuid→id`, transaction por item, limite 200, `server_time` como âncora).
- Atuam **só no próprio domínio**; se a tarefa sair do domínio, param e apontam qual agente é o dono.
- Declaram o que verificaram, o que **não** verificaram e quais comandos rodaram.
- Preferem mudança pequena, rastreável, compatível com o padrão existente. Sem overengineering.
- Usam os **scripts já existentes** para validação e reportam resultado real (não confundem "não testado" com "passou").
- Reportam **risco residual**.
- **Não** fazem commit, push, deploy, migration destrutiva, alteração de secret nem committam `.env` sem autorização explícita.
- Tratam segurança, qualidade, performance e resiliência como princípios **simultâneos** — nunca sacrificados por "entregar rápido".

## Catálogo

| Agente | Domínio | Modo | Pode implementar? |
|--------|---------|------|-------------------|
| `software-architect` | Arquitetura, contratos, modelo multi-tenant, estratégia de auth/sync, trade-offs, ADR | **read-only** | Não — desenha, decide e delega |
| `backend-engineer` | APIs NestJS/TypeORM, regras de negócio, auth/authz, DTOs, contratos, isolamento tenant | read → write | **Sim** (backend) |
| `frontend-engineer` | UI React/Vite, shadcn/ui, Zustand, React Hook Form, Recharts, a11y, UX | read → write | **Sim** (frontend) |
| `mobile-engineer` | React Native/Expo, SQLite, fila offline, ciclo de sync, sessão mobile | read → write | **Sim** (mobile) |
| `database-engineer` | Schema, migrations TypeORM, índices, constraints, tenant_id, soft delete, performance | read → write | **Sim** (só escreve migration; NÃO executa sem autorização) |
| `test-engineer` | Jest e testes de frontend/mobile, fixtures, cenários de erro, regressão | read → write | **Sim** (testes; não altera lógica de produção) |
| `security-auditor` | Auth, sessão, tokens, CORS, rate limit, secrets, PII, isolamento tenant | **read-only** | Não — emite achados BLOCKER/HIGH/MEDIUM/LOW |
| `lgpd-auditor` | Privacidade, minimização, retenção, exposição de PII, consentimento | **read-only** | Não — aponta risco de conformidade |
| `quality-reviewer` | Revisão de PR/diff: regressão, escopo, testes, arquitetura, segurança | **read-only** | Não — aprova/bloqueia com evidência |
| `docs-reporter` | Documentação viva e rastreabilidade em `docs/` | escreve só em `docs/` (+ este README) | Não altera código — registra estado real |

**Read-only:** `software-architect`, `security-auditor`, `lgpd-auditor`, `quality-reviewer` (sem `Edit`/`Write`).
**Implementam código:** `backend-engineer`, `frontend-engineer`, `mobile-engineer`, `database-engineer`, `test-engineer`.
**Escreve só documentação:** `docs-reporter` (apenas `docs/` e `.claude/agents/README.md`; nunca código/config/migration/secret).

## Quando usar cada um

- **software-architect** — desenhar módulo novo, definir/mudar contrato transversal, escolher entre abordagens, avaliar impacto sistêmico, decidir estratégia de tenant/auth/sync. Antes de o engenheiro implementar algo estrutural.
- **backend-engineer** — endpoint novo, regra de negócio, validação, contrato de API, guard/authz, endpoint de sync.
- **frontend-engineer** — tela, componente, store/hook, formulário, estado de loading/erro/vazio, gráfico, a11y.
- **mobile-engineer** — tela mobile, fila offline, ciclo de sync, sessão mobile, schema SQLite local.
- **database-engineer** — nova migration, índice, constraint, integridade referencial, query lenta, concorrência/lock.
- **test-engineer** — cobrir regra crítica, reproduzir bug com teste, faltam bordas, smoke de fluxo.
- **security-auditor** — antes de expor rota, revisar auth/isolamento tenant, threat model de um fluxo.
- **lgpd-auditor** — fluxo que coleta nome/email/telefone/CPF, tela pública, retenção/exposição de PII, dado replicado no device.
- **quality-reviewer** — antes de concluir qualquer PR/diff.
- **docs-reporter** — ao FINAL de todo diagnóstico, implementação, revisão, correção ou auditoria, para registrar o estado real em `docs/`.

## Regra obrigatória de rastreabilidade

**Nenhum achado relevante pode ficar só no chat.** Todo problema aberto, bug corrigido, ressalva de review, decisão importante ou próximo passo é registrado pelo `docs-reporter` nos arquivos de `docs/`:
`PROBLEM_LEDGER.md` · `BUGFIX_LOG.md` · `BACKLOG.md` · `SYSTEM_OVERVIEW.md` · `REVIEW_REPORTS/` · `DIAGRAMS.md`.

## Ciclos recomendados (todos terminam em `docs-reporter`)

### 1. Implementação
1. `software-architect` — se a mudança for estrutural / novo contrato (opcional, mas recomendado para decisão relevante).
2. `backend-engineer` / `frontend-engineer` / `mobile-engineer` / `database-engineer` / `test-engineer` — conforme a área.
3. `quality-reviewer` — **obrigatório**.
4. `security-auditor` — se envolver autenticação, autorização, dado sensível ou multi-tenant.
5. `lgpd-auditor` — se envolver dados pessoais.
6. **`docs-reporter`** — registra estado final.

### 2. Revisão
1. `quality-reviewer`.
2. `security-auditor` — se houver risco de segurança.
3. `lgpd-auditor` — se houver dados pessoais.
4. **`docs-reporter`**.

### 3. Bug
1. Agente da área responsável — fix.
2. `test-engineer` — teste de regressão que falha sem o fix.
3. `quality-reviewer`.
4. **`docs-reporter`** — registra em `BUGFIX_LOG.md` (+ `PROBLEM_LEDGER.md`).

Para **auditoria pura**: `security-auditor` / `lgpd-auditor` / `quality-reviewer` (sem alterar código) → `docs-reporter`.
Para **decisão de arquitetura pura**: `software-architect` → `docs-reporter` (registra a decisão/ADR).
