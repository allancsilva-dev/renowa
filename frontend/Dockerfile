# ── Estágio 1: build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# ARGs precisam ser declarados ANTES de serem usados no build
# Vite embute as variáveis VITE_* no bundle em tempo de build — não existe runtime config
ARG VITE_API_URL=https://api.renowa.zonadev.tech/api
ARG VITE_AUTH_URL=https://auth.zonadev.tech
ARG VITE_EXPECTED_AUD=renowa.zonadev.tech

# Expõe os ARGs como variáveis de ambiente para o processo de build do Vite
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_AUTH_URL=$VITE_AUTH_URL
ENV VITE_EXPECTED_AUD=$VITE_EXPECTED_AUD

COPY package*.json ./
# npm install em vez de npm ci — o package-lock.json fica na raiz do monorepo (npm workspaces)
# e não é copiado para o contexto de build do frontend, então o npm ci falharia sem ele
RUN npm install --ignore-scripts

COPY . .
RUN npm run build

# ── Estágio 2: produção ───────────────────────────────────────────────────────
FROM nginx:alpine AS production

# Copia configuração customizada antes dos arquivos estáticos
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia apenas o bundle final — o node_modules não vai para produção
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
