# Deploy Hostinger VPS

Modelo recomendado: Docker Compose sobe API e frontend sem publicar portas no host. O Nginx Proxy Manager acessa `Renowa-Web:80` pela rede Docker externa `proxy`. O frontend encaminha `/api` para a API pela rede interna dedicada `api_gateway`.

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
TRUST_PROXY=172.30.0.2/32
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
- Forward Hostname/IP: `Renowa-Web`
- Forward Port: `80`
- Websockets: off
- SSL: Let's Encrypt ativo
- Force SSL: on
- HTTP/2: on

O container do NPM deve participar da rede externa `proxy`. Nao publicar nem criar proxy direto para a API. O NPM deve sobrescrever `X-Real-IP`, `X-Forwarded-For` e `X-Forwarded-Proto`; o frontend normaliza esses valores antes de chamar a API.

## Health checks

```bash
docker exec Renowa-API wget -qO- http://localhost:3000/api/health
docker exec Renowa-Web wget -qO- --header='X-Real-IP: 127.0.0.1' --header='X-Forwarded-Proto: https' http://localhost/api/health
curl -fsS https://renowa.zonadev.tech/api/health
```

## Observacoes criticas

- `backend/env_renowa.txt` ja apareceu versionado com segredos. Remover do indice e purgar historico antes de producao seria.
- `TRUST_PROXY` deve corresponder somente ao IP do frontend na rede `api_gateway`. Alterar IP/sub-rede exige atualizar ambos juntos.
- A API falha no bootstrap de producao se `TRUST_PROXY` estiver ausente ou amplo.
