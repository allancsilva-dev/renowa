# Contexto de build: RAIZ do monorepo (ver docker-compose.prod.yml).
#
# O backend depende de `@renowa/shared`, que é workspace privado e NUNCA foi
# publicado no registry. Com o contexto em ./backend, o `npm install` só tinha
# o manifesto do backend e tentava baixar o pacote:
#   npm error 404 Not Found - GET https://registry.npmjs.org/@renowa%2fshared
# Nenhuma das imagens buildava. O contexto na raiz é o que dá ao npm a árvore
# de workspaces inteira.

# ── Estágio 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Os 4 manifestos + lockfile ANTES do source: a camada de deps só invalida
# quando uma dependência muda. `npm ci` valida o lockfile contra o conjunto
# COMPLETO de workspaces declarado nele — sem frontend/mobile aqui, ele recusa.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY mobile/package.json ./mobile/

# `npm ci`, não `npm install`: PROB-0071 corrigiu vulnerabilidades via
# `overrides` na raiz + dedup, e o `npm audit` que fechou aquele gate rodou
# contra este package-lock.json. Com `npm install` a imagem re-resolveria a
# árvore, e a árvore auditada deixaria de ser a árvore embarcada.
RUN npm ci --workspace=shared --workspace=backend --include-workspace-root --ignore-scripts

COPY shared ./shared
COPY backend ./backend

RUN npm run build --workspace=shared && npm run build --workspace=backend

# ── Estágio 2: produção ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY mobile/package.json ./mobile/

# `--ignore-scripts` é seguro para o argon2: ele resolve o binário nativo por
# `node-gyp-build` em tempo de require, e o tarball já traz
# prebuilds/linux-x64/argon2.musl.node — a variante musl que o alpine precisa.
# Sem esse prebuild, a imagem exigiria build-base + python3.
RUN npm ci --omit=dev --workspace=shared --workspace=backend --include-workspace-root --ignore-scripts \
    && npm cache clean --force

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/src/database/migrations ./backend/dist/database/migrations

# WORKDIR no workspace: `npm run db:migrate|db:verify|db:bootstrap` usam caminho
# relativo a ./dist. A resolução de módulos sobe até /app/node_modules.
WORKDIR /app/backend

USER node

EXPOSE 3000

CMD ["node", "dist/main"]
