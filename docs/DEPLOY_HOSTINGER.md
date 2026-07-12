# Deploy Hostinger VPS

Modelo recomendado: Docker Compose na raiz sobe `renowa-api` e `renowa-frontend`. O Nginx Proxy Manager aponta o dominio publico para `127.0.0.1:3080`. O frontend nginx encaminha `/api` para `renowa-api:3000` pela rede Docker interna.

## Pre-requisitos

- Docker e Docker Compose instalados na VPS.
- Nginx Proxy Manager rodando na mesma VPS.
- DNS do dominio apontando para o IP da VPS.
- `backend/.env` criado na VPS, nunca versionado.
- Segredos rotacionados antes do deploy: senha do banco, `RENOWA_AT_SECRET`, `RENOWA_JWT_SECRET`.

## `backend/.env` minimo

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://usuario:senha@host:porta/banco
CORS_ORIGIN=https://renowa.zonadev.tech
RENOWA_AT_SECRET=troque-por-valor-aleatorio-256-bits
RENOWA_JWT_SECRET=troque-por-outro-valor-aleatorio-256-bits
```

Com proxy same-origin em `/api`, o browser nao depende de CORS. `CORS_ORIGIN` fica como defesa caso a API seja chamada direto.

## Subir

```bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml ps
docker logs --tail=80 renowa-api
docker logs --tail=80 renowa-frontend
```

## Nginx Proxy Manager

- Proxy Host: `renowa.zonadev.tech`
- Forward Hostname/IP: `127.0.0.1`
- Forward Port: `3080`
- Websockets: off
- SSL: Let's Encrypt ativo
- Force SSL: on
- HTTP/2: on

Nao criar proxy publico separado para `3002`, salvo necessidade explicita. A porta `3002` fica presa em `127.0.0.1`.

## Health checks

```bash
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS http://127.0.0.1:3080/api/health
curl -fsS https://renowa.zonadev.tech/api/health
```

## Observacoes criticas

- `backend/env_renowa.txt` ja apareceu versionado com segredos. Remover do indice e purgar historico antes de producao seria.
- O compose nao sobe PostgreSQL. Ele assume banco existente acessivel por `DATABASE_URL`.
- Migrations SQL existem em `backend/src/database/migrations`, mas nao ha runner de producao automatizado no `package.json`. Aplicar migrations manualmente antes do `up -d` ate existir runner confiavel.
