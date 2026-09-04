# Contexto de build: RAIZ do monorepo (ver docker-compose.prod.yml).
# Mesmo motivo do backend: `@renowa/shared` é workspace privado, não publicado.
FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
COPY mobile/package.json ./mobile/

RUN npm ci --workspace=shared --workspace=frontend --include-workspace-root --ignore-scripts

COPY shared ./shared
COPY frontend ./frontend

RUN npm run build --workspace=shared && npm run build --workspace=frontend

FROM nginx:alpine AS production

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
