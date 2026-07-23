# Deploy Hostinger VPS

Modelo recomendado: Docker Compose publica API e frontend somente no loopback da VPS (`127.0.0.1:3083` e `127.0.0.1:3080`, respectivamente), sem exposicao direta na interface publica. O Nginx Proxy Manager tambem pode acessar `Renowa-Web:80` pela rede Docker externa `proxy`. O frontend encaminha `/api` para a API pela rede interna dedicada `api_gateway`.

## Pre-requisitos

- Docker e Docker Compose instalados na VPS.
- Nginx Proxy Manager rodando na mesma VPS.
- DNS do dominio apontando para o IP da VPS.
- Rede Docker externa `proxy` criada: `docker network create proxy` (o compose a declara como `external: true`; sem ela o `up` falha).
- `.env` na raiz do repo e `backend/.env` criados na VPS, nunca versionados (ver abaixo — sao **dois** arquivos distintos).
- Segredos rotacionados antes do deploy: senha do banco, `RENOWA_AT_SECRET`, `RENOWA_JWT_SECRET`.

## Os dois arquivos de ambiente

### `.env` na RAIZ — consumido pelo Compose

O Compose interpola estas variaveis nos servicos `db` e `backup`. Sem elas, `docker compose config` avisa "variable is not set" e o Postgres sobe com valores vazios.

```env
POSTGRES_DB=renowa
POSTGRES_USER=renowa
POSTGRES_PASSWORD=<senha-forte-nova>

# Tag das imagens. Use o SHA do commit — e o que torna rollback possivel.
RENOWA_VERSION=<git-sha-curto>

BACKUP_RETENTION_DAYS=14
BACKUP_INTERVAL_SECONDS=86400
```

### `backend/.env` — consumido pelo container da API

```env
NODE_ENV=production
PORT=3000
TRUST_PROXY=172.30.0.2/32
DATABASE_URL=postgresql://renowa:<senha-forte-nova>@db:5432/renowa
CORS_ORIGIN=https://renowa.zonadev.tech
RENOWA_AT_SECRET=<openssl rand -base64 48>
RENOWA_JWT_SECRET=<outro openssl rand -base64 48>
```

O host em `DATABASE_URL` e `db` — nome do servico na rede `renowa`, nao `localhost` nem IP. `REDIS_URL` e `NODE_ENV` ja vem do proprio compose.

Com proxy same-origin em `/api`, o browser nao depende de CORS. `CORS_ORIGIN` fica como defesa caso a API seja chamada direto.

## Subir

O contexto de build e a **raiz do monorepo** (backend e frontend dependem do workspace privado `@renowa/shared`, que nao existe no registry npm). Rode sempre da raiz do repo.

```bash
export RENOWA_VERSION=$(git rev-parse --short HEAD)
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
docker logs --tail=80 Renowa-API
docker logs --tail=80 Renowa-Web
```

## Primeiro deploy: banco vazio

O banco novo sobe vazio e **nao ha cadastro publico** — nenhuma rota cria tenant ou primeiro usuario. A sequencia abaixo e obrigatoria, nessa ordem.

1. **Migrations.** Rodam sozinhas no boot da API (`main.ts` chama `runMigrations()` antes de subir o HTTP, com advisory lock). Confirme no log: 19 linhas `Migration aplicada:`.

2. **Gate de schema** — `schema_migrations` diz o que rodou, nao o que sobreviveu (licao de PROB-0061). Só a inspecao do catalogo do Postgres prova:

   ```bash
   docker exec Renowa-API npm run db:verify
   ```

   Saida esperada: `OK: schema integro`. Saida diferente **para o deploy** — decida explicitamente o que fazer com cada divergencia antes de seguir.

3. **Primeiro admin.** Gere um UUID de tenant e guarde-o (nao ha tabela `tenants`; esse UUID e a unica referencia do inquilino):

   ```bash
   TENANT_ID=$(uuidgen | tr 'A-Z' 'a-z')
   echo "TENANT_ID do cliente: $TENANT_ID"   # anote

   docker exec \
     -e ADMIN_EMAIL='admin@empresa.com.br' \
     -e ADMIN_NOME='Nome do Admin' \
     -e ADMIN_SENHA='<senha-forte>' \
     -e TENANT_ID="$TENANT_ID" \
     Renowa-API npm run db:bootstrap
   ```

   Saida esperada: `Admin criado: ... (papel admin, tenant ...)`. O comando e idempotente: rodar de novo com o mesmo e-mail responde `Admin ja existe` e sai com 0.

4. **Confirme as permissoes.** O admin precisa das 28 permissoes do catalogo — sem elas o login funciona e todo endpoint responde 403:

   ```bash
   docker exec Renowa-DB psql -U renowa -d renowa -tAc \
     "select r.name, r.is_system, count(p.permission_slug)
        from tenant_roles r left join tenant_role_permissions p on p.role_id = r.id
       group by r.name, r.is_system"
   ```

   Esperado: `admin|t|28`.

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
docker exec Renowa-API wget -qO- http://localhost:3000/api/health/ready   # toca o banco
docker exec Renowa-Web wget -qO- --header='X-Real-IP: 127.0.0.1' --header='X-Forwarded-Proto: https' http://localhost/api/health
curl -fsS https://renowa.zonadev.tech/api/health
```

`/api/health` responde mesmo com o banco fora; `/api/health/ready` e o que prova a conexao. O healthcheck do compose usa `ready`.

## Rollback

As imagens sao marcadas com `RENOWA_VERSION`. Para voltar a uma versao anterior:

```bash
RENOWA_VERSION=<sha-anterior> docker compose -f docker-compose.prod.yml up -d
```

**O banco nao volta junto.** O runner de migrations e forward-only, sem `down`. Rollback de imagem so e seguro se o schema novo for compativel com o codigo antigo. Mudanca destrutiva (drop de coluna, rename, constraint mais estrita) exige janela e plano proprio — nao da para desfazer com troca de tag.

Restauracao de banco e caminho separado, a partir do backup (abaixo).

## Backup e restore

O servico `backup` roda `pg_dump --format=custom` a cada `BACKUP_INTERVAL_SECONDS` em `./backups`, com `.sha256` ao lado e expurgo por `BACKUP_RETENTION_DAYS`.

**Backup sem restore verificado nao e backup.** Teste uma vez, contra um banco descartavel, antes do go-live:

```bash
# 1. gera um dump imediato
docker compose -f docker-compose.prod.yml run --rm -e BACKUP_ONCE=true backup

# 2. confere o checksum
cd backups && sha256sum -c renowa-<timestamp>.dump.sha256 && cd ..

# 3. restaura em banco novo e roda o gate de schema em cima do restaurado
#    (pg_restore ... -d <banco-descartavel>; depois DATABASE_URL apontando
#     para ele, `npm run db:verify` tem que sair OK)
```

## Observacoes criticas

- `backend/env_renowa.txt` foi versionado no commit `471e4fb` com `DATABASE_URL` e `RENOWA_JWT_SECRET` reais. Saiu do indice, mas **continua recuperavel no historico**. Nenhum valor dele pode ser reaproveitado; purgar o blob (`git filter-repo`) e o passo seguinte.
- `TRUST_PROXY` deve corresponder somente ao IP do frontend na rede `api_gateway`. Alterar IP/sub-rede exige atualizar ambos juntos.
- A API falha no bootstrap de producao se `TRUST_PROXY` estiver ausente ou amplo, e se `CORS_ORIGIN` ou `REDIS_URL` faltarem. Isso e proposital.
- **Migrations rodam no boot**, e `restart: unless-stopped` esta ligado: migration que falha vira crash loop. Se o container reiniciar em loop, leia `docker logs Renowa-API` antes de qualquer outra coisa — a causa costuma estar na primeira falha, nao na ultima.
- **Paridade de versao do Postgres:** dev roda 15, producao fixa `postgres:16-alpine` (BACKLOG-0036). O ensaio de banco vazio desta rodada foi feito contra a 16.
