# ── Estágio 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Instala todas as deps (incluindo devDeps para o nest build)
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

# ── Estágio 2: produção ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# Apenas dependências de produção
RUN npm install --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist
COPY src/database/migrations ./dist/database/migrations

EXPOSE 3000

CMD ["node", "dist/main"]
