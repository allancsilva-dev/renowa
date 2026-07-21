# Renowa

Sistema de gestão comercial B2B SaaS com suporte a múltiplos tenants, pensado para equipes de vendas externas. Oferece gerenciamento de clientes, pedidos, produtos, fornecedores, transportadoras e financeiro — com app mobile offline-first para representantes em campo.

---

## Deploy com Docker (atualizar produção)

Os containers de backend e frontend são independentes e ficam em diretórios separados.

### Backend (`renowa-api`)

```bash
cd backend

# 1. Rebuild da imagem com o código atual
docker compose -f docker-compose.prod.yml build --no-cache

# 2. Recriar o container (zero downtime se tiver health check)
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 3. Acompanhar os logs
docker logs -f renowa-api
```

> O backend usa `synchronize: true` fora de produção (`NODE_ENV != production`).
> Em produção, as migrações de schema devem ser aplicadas manualmente antes do deploy.

### Frontend (`renowa-frontend`)

```bash
cd frontend

# 1. Rebuild da imagem (as variáveis VITE_* são embutidas no bundle em build time)
docker compose -f docker-compose.prod.yml build --no-cache

# 2. Recriar o container
docker compose -f docker-compose.prod.yml up -d --force-recreate

# 3. Verificar se subiu
docker logs renowa-frontend
```

### Comandos úteis

```bash
# Ver status dos containers
docker ps | grep renowa

# Reiniciar sem rebuild
docker restart renowa-api
docker restart renowa-frontend

# Ver uso de recursos
docker stats renowa-api renowa-frontend

# Remover imagens antigas (libera espaço)
docker image prune -f
```

---

## Changelog

### v3.0 — Módulo Financeiro (Mar 2026)

#### Visual
- Background global alterado para `#F4F7F6` (cinza esverdeado)
- Sidebar: item ativo agora exibe fundo `#F4F7F6` com texto `#2A9D8F` (antes era branco com fundo transparente)
- Dashboard: filtros de mês/ano inicializam com a data atual (antes iniciavam em Janeiro/2024)

#### Dashboard
- Adicionados botões **Exportar CSV** e **Imprimir** no cabeçalho do dashboard
- Anos disponíveis no filtro gerados dinamicamente a partir de 2024 até o ano atual

#### Formulário de Clientes
- Máscara automática de **CNPJ** (`00.000.000/0000-00`)
- Máscara automática de **CEP** (`00000-000`) com autocomplete via **ViaCEP** (preenche endereço, bairro, cidade e UF automaticamente)
- Máscara automática de **telefone** (`(00) 00000-0000`)
- Dropdown de **UF** com todos os 27 estados

#### Transporte
- Corrigido modal "Nova Transportadora" que não funcionava — reescrito com estado controlado e POST para `/transportadoras`
- Máscara de CNPJ e telefone no formulário de transportadora

#### Backend — Módulo Financeiro

**Entidade `comissoes` expandida:**
| Campo novo | Tipo | Descrição |
|---|---|---|
| `cliente_id` | FK | Referência ao cliente |
| `fornecedor_id` | FK | Referência ao fornecedor |
| `numero_pedido` | varchar | Número do pedido |
| `numero_nfe` | varchar | Número da NF-e |
| `data_pedido` | date | Data do pedido |
| `data_faturamento` | date | Data do faturamento |
| `valor_pedido` | decimal | Valor bruto do pedido |
| `valor_faturado` | decimal | Valor efetivamente faturado |
| `perc_comissao` | decimal | Percentual de comissão |
| `status` | varchar | `pendente` / `pago` |

**Nova entidade `parceiros_comerciais`:** registra vendas intermediadas por parceiros com divisão de comissão configurável (padrão 50%).

**Novos endpoints:**

```
GET    /api/financeiro/fluxo-caixa?mes=&ano=
         → receitas (soma valor_comissao do mês), custos, saldo, lançamentos

GET    /api/financeiro/comissoes/resumo?mes=&ano=
GET    /api/financeiro/comissoes/por-empresa?fornecedor_id=&mes=&ano=
PATCH  /api/financeiro/lancamentos/:uuid
PATCH  /api/financeiro/comissoes/:uuid
DELETE /api/financeiro/comissoes/:uuid
POST   /api/financeiro/parceiros
GET    /api/financeiro/parceiros?page&limit&nome_parceiro&mes&ano
PATCH  /api/financeiro/parceiros/:uuid
DELETE /api/financeiro/parceiros/:uuid
PATCH  /api/financeiro/inadimplencia/:uuid
DELETE /api/financeiro/inadimplencia/:uuid
```

#### Frontend — Financeiro (`/financeiro`)

Página completamente reescrita com 6 abas:

| Aba | Conteúdo |
|---|---|
| **Fluxo de Caixa** | Receitas, custos e saldo do mês com filtro mês/ano |
| **Empresas** | Vendas agrupadas por fornecedor com totais de comissão |
| **Parceiros** | Gestão de parceiros comerciais com divisão de comissão |
| **Comissão** | Lançamento e acompanhamento de comissões individuais |
| **Custos** | Lançamentos de Custo Fixo e Custo Rotativo |
| **Inadimplência** | Registro e gestão de clientes inadimplentes |

> **Regra de negócio:** Receitas no Fluxo de Caixa = soma de `valor_comissao` das comissões com `data_faturamento` no mês (não o valor bruto de vendas).

---

## Índice

- [Visão Geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Stack Tecnológica](#stack-tecnológica)
- [Pré-requisitos](#pré-requisitos)
- [Configuração de Ambiente](#configuração-de-ambiente)
- [Instalação e Execução](#instalação-e-execução)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Backend](#backend)
  - [Módulos](#módulos)
  - [Autenticação](#autenticação)
  - [Banco de Dados](#banco-de-dados)
  - [Endpoints da API](#endpoints-da-api)
  - [Formato de Resposta](#formato-de-resposta)
  - [Rate Limiting](#rate-limiting)
  - [Tratamento de Erros](#tratamento-de-erros)
- [Frontend](#frontend)
  - [Estrutura de Telas](#estrutura-de-telas)
  - [Gerenciamento de Estado](#gerenciamento-de-estado)
  - [Fluxo de Autenticação Web](#fluxo-de-autenticação-web)
- [Mobile](#mobile)
  - [Arquitetura Offline-First](#arquitetura-offline-first)
  - [Sincronização Bidirecional](#sincronização-bidirecional)
  - [Banco de Dados Local](#banco-de-dados-local)
- [Multi-Tenancy](#multi-tenancy)
- [Papéis e Permissões](#papéis-e-permissões)
- [Esquema do Banco de Dados](#esquema-do-banco-de-dados)
- [Padrões Arquiteturais](#padrões-arquiteturais)

---

## Visão Geral

O Renowa é um sistema monorepo composto por três aplicações independentes que se comunicam via REST API:

| Aplicação  | Tecnologia              | Porta padrão |
|------------|-------------------------|--------------|
| `backend`  | NestJS + PostgreSQL      | `3000`       |
| `frontend` | React + Vite + Tailwind  | `5173`       |
| `mobile`   | React Native + Expo      | gerenciada pelo Expo |

A autenticação é delegada ao serviço externo **ZonaDev Auth** (`auth.zonadev.tech`), que emite tokens RS256 validados via JWKS. O app mobile utiliza um token HS256 próprio (30 dias) gerado pelo backend após a autenticação inicial.

---

## Arquitetura

```
┌──────────────────────────────────────────────────────────────────┐
│                         RENOWA MONOREPO                          │
│                                                                  │
│  ┌────────────┐    REST/JSON   ┌───────────────────────────────┐ │
│  │  Frontend  │◄──────────────►│                               │ │
│  │  (React)   │                │         Backend               │ │
│  └────────────┘                │         (NestJS)              │ │
│                                │                               │ │
│  ┌────────────┐  REST/Sync API │  ┌──────────┐  TypeORM        │ │
│  │   Mobile   │◄──────────────►│  │  Guards  │◄─────────────►  │ │
│  │ (Expo/RN)  │                │  │ Throttle │    PostgreSQL   │ │
│  │            │                │  │   CLS    │                 │ │
│  │  SQLite    │                └───────────────────────────────┘ │
│  │  (offline) │                                                  │
│  └────────────┘                                                  │
│                                                                  │
│           ▲                         ▲                            │
│           │      ZonaDev Auth       │                            │
│           └─────────────────────────┘                            │
│                 (RS256 / JWKS)                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológica

### Backend
| Biblioteca               | Versão   | Uso                                      |
|--------------------------|----------|------------------------------------------|
| NestJS                   | ^10.4.0  | Framework principal                      |
| TypeORM                  | ^0.3.20  | ORM                                      |
| PostgreSQL (`pg`)        | ^8.13.1  | Banco de dados relacional                |
| `jose`                   | ^5.9.6   | Validação JWKS (RS256)                   |
| `jsonwebtoken`           | ^9.0.2   | Geração de tokens HS256 para mobile      |
| `class-validator`        | ^0.14.1  | Validação de DTOs                        |
| `class-transformer`      | ^0.5.1   | Transformação de objetos                 |
| `nestjs-throttler`       | ^6.3.0   | Rate limiting por usuário                |
| `nestjs-cls`             | ^4.4.1   | Context Local Storage (tenant isolation) |
| `compression`            | —        | Gzip na resposta HTTP                    |
| `cookie-parser`          | —        | Leitura de cookies de sessão             |

### Frontend
| Biblioteca               | Versão   | Uso                                       |
|--------------------------|----------|-------------------------------------------|
| React                    | 18.3.1   | Framework UI                              |
| Vite                     | 6.0.7    | Build tool e dev server                   |
| react-router-dom         | 6.28.1   | Roteamento SPA                            |
| Zustand                  | 5.0.3    | Gerenciamento de estado global            |
| react-hook-form          | 7.54.2   | Formulários performáticos                 |
| Zod                      | 3.24.1   | Validação de esquemas                     |
| Radix UI                 | —        | Componentes UI acessíveis (headless)      |
| Tailwind CSS             | 3.4.17   | Estilização utility-first                 |
| recharts                 | 2.15.0   | Gráficos e dashboards                     |
| axios                    | 1.7.9    | Cliente HTTP                              |
| lucide-react             | 0.469.0  | Ícones                                    |
| @react-pdf/renderer      | 4.1.5    | Exportação para PDF                       |

### Mobile
| Biblioteca                              | Versão   | Uso                                     |
|-----------------------------------------|----------|-----------------------------------------|
| React Native                            | 0.76.6   | Framework mobile                        |
| Expo                                    | 52.0.0   | Build e toolchain                       |
| expo-sqlite                             | 15.0.0   | Banco de dados SQLite offline           |
| expo-secure-store                       | 14.0.0   | Armazenamento seguro do token           |
| @react-native-community/netinfo         | 11.4.1   | Detecção de conectividade               |
| axios                                   | 1.7.9    | Cliente HTTP                            |

---

## Pré-requisitos

- **Node.js** >= 20.x
- **npm** >= 10.x (o projeto usa npm workspaces)
- **PostgreSQL** >= 15 (local via Docker ou instalação nativa)
- **Docker** (opcional, mas recomendado para subir o Postgres local rapidamente)
- **Expo CLI** (para mobile): `npm install -g expo-cli`
- **Redis** — só é obrigatório em produção (rate limiting compartilhado); em dev o throttler cai automaticamente para storage em memória se `REDIS_URL` não estiver definida

> A autenticação é **nativa** (e-mail/senha com hash argon2, JWT HS256 para cookie web e sessão mobile — ver `backend/src/auth`). Não há dependência de um serviço externo de auth para rodar ou logar localmente; as variáveis `ZONADEV_JWKS_URL`/`VITE_AUTH_URL`/`VITE_AUTH_AUD` que aparecem em versões antigas de `.env.example` não são lidas pelo código atual e podem ser ignoradas.

---

## Configuração de Ambiente

Copie o arquivo `.env.example` e crie os arquivos de variáveis de ambiente:

```bash
# Na raiz do monorepo — o .env.example contém todas as variáveis necessárias
cp .env.example .env
```

### Variáveis por aplicação

#### Backend (`backend/.env`)

```env
NODE_ENV=development
PORT=3000

# PostgreSQL
DATABASE_URL=postgresql://renowa:devpassword@localhost:5433/renowa

# CORS — origens permitidas (separar por vírgula se múltiplas)
CORS_ORIGIN=http://localhost:5173

# Auth nativa — access token web (JWT HS256, 15 min, cookie renowa_at)
RENOWA_AT_SECRET=troque-por-segredo-forte-256-bits

# Segredo para sessões mobile (JWT HS256, 30 dias)
RENOWA_JWT_SECRET=troque-por-outro-segredo-forte-256-bits

# Opcional em dev — só é exigida em produção (throttling compartilhado)
# REDIS_URL=redis://localhost:6379/0
```

> Em `NODE_ENV != production` o TypeORM roda com `synchronize: true`, ou seja, o schema é criado/atualizado automaticamente a partir das entities — não é preciso rodar migrations manualmente em dev.

#### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:3000/api
```

#### Mobile (`mobile/.env` / `app.json > extra`)

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api
```

> O `app.json` do mobile também contém a URL em `extra.apiUrl` para compatibilidade com builds nativos.

---

## Instalação e Execução

### Instalar todas as dependências (monorepo)

```bash
npm install
```

### Subir o PostgreSQL local (Docker)

Se você não tem um PostgreSQL rodando localmente, suba um container dedicado ao ambiente de dev (persistente — não precisa recriar a cada sessão):

```bash
docker run -d --name renowa-dev-postgres \
  --restart unless-stopped \
  -e POSTGRES_DB=renowa \
  -e POSTGRES_USER=renowa \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5433:5432 \
  postgres:15-alpine
```

A porta `5433` (em vez de `5432`) evita conflito com um PostgreSQL nativo já instalado na máquina. Ajuste `DATABASE_URL` no `backend/.env` de acordo com a porta/senha escolhidas. Com `--restart unless-stopped`, o container volta a subir sozinho quando o Docker Desktop reinicia; os dados ficam persistidos enquanto o container não for removido (`docker rm`).

### Executar todas as aplicações em paralelo

```bash
# Backend (hot-reload na porta 3000)
npm run backend

# Frontend (dev server na porta 5173)
npm run frontend

# Mobile (Expo — QR code para dispositivo físico)
npm run mobile
```

### Scripts por workspace

#### Backend

```bash
cd backend

npm run start:dev    # Desenvolvimento com hot-reload (nest start --watch)
npm run start:debug  # Debug com hot-reload
npm run build        # Compilação para produção → dist/
npm run start        # Produção (node dist/main)
npm run test         # Jest
npm run lint         # ESLint
```

#### Frontend

```bash
cd frontend

npm run dev          # Dev server (Vite, porta 5173)
npm run build        # Produção (tsc + vite build)
npm run preview      # Preview do build de produção
npm run lint         # ESLint
```

#### Mobile

```bash
cd mobile

npm start            # Expo start (QR code)
npm run android      # Abrir no emulador Android
npm run ios          # Abrir no simulador iOS
npm run web          # Abrir no navegador (experimental)
```

---

## Estrutura do Projeto

```
renowa/
├── package.json                  # Monorepo raiz (npm workspaces)
├── .env.example                  # Template de variáveis de ambiente
├── .gitignore
│
├── backend/
│   ├── nest-cli.json
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── main.ts               # Bootstrap da aplicação
│       ├── app.module.ts         # Módulo raiz
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── auth.service.ts
│       │   ├── auth.controller.ts
│       │   ├── jwks.strategy.ts  # Validação RS256 via JWKS
│       │   ├── mobile-session.service.ts
│       │   ├── entities/
│       │   │   └── mobile-session.entity.ts
│       │   └── dto/
│       │       └── mobile-session.dto.ts
│       ├── users/
│       │   ├── users.module.ts
│       │   ├── users.service.ts
│       │   └── entities/user.entity.ts
│       ├── clients/              # Módulo clientes
│       ├── orders/               # Módulo pedidos + itens
│       ├── products/             # Módulo produtos
│       ├── suppliers/            # Módulo fornecedores
│       ├── transport/            # Módulo transportadoras
│       ├── finance/              # Módulo financeiro
│       ├── sync/                 # Módulo sincronização mobile
│       └── common/
│           ├── entities/
│           │   └── base.entity.ts
│           ├── guards/
│           │   ├── jwt-auth.guard.ts
│           │   ├── roles.guard.ts
│           │   └── user-throttler.guard.ts
│           ├── decorators/
│           │   ├── public.decorator.ts
│           │   └── current-user.decorator.ts
│           ├── interceptors/
│           │   └── tenant-context.interceptor.ts
│           ├── subscribers/
│           │   └── tenant.subscriber.ts
│           └── types/
│               └── jwt-payload.type.ts
│
├── frontend/
│   ├── vite.config.ts            # Proxy /api → :3000, alias @/
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── components.json           # Config shadcn/ui
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── index.css
│       ├── store/
│       │   ├── authStore.ts      # Estado global de autenticação
│       │   └── uiStore.ts        # Estado global de UI
│       ├── services/
│       │   ├── api.ts            # Instância axios com interceptors
│       │   ├── clients.service.ts
│       │   └── orders.service.ts
│       ├── hooks/
│       │   ├── useAuth.ts
│       │   ├── useDebounce.ts
│       │   └── usePaginatedQuery.ts
│       ├── components/
│       │   ├── layout/           # AppShell, Header, Sidebar
│       │   ├── tables/
│       │   │   └── DataTable.tsx
│       │   └── feedback/
│       │       ├── EmptyState.tsx
│       │       └── ErrorState.tsx
│       └── pages/
│           ├── Dashboard.tsx
│           ├── Clientes.tsx
│           ├── Pedidos.tsx
│           ├── Produtos.tsx
│           ├── Transporte.tsx
│           ├── Financeiro.tsx
│           └── Configuracoes.tsx
│
└── mobile/
    ├── app.json                  # Config Expo (bundle id, splash, etc.)
    ├── tsconfig.json
    ├── package.json
    ├── App.tsx                   # Entrada do app + NavContainer
    └── src/
        ├── services/
        │   ├── ApiService.ts     # HTTP + gerenciamento de sessão
        │   └── SyncService.ts    # Lógica de sincronização offline
        ├── screens/
        │   ├── LoginScreen.tsx
        │   └── HomeScreen.tsx
        └── database/
            └── schema.ts         # Definição das tabelas SQLite locais
```

---

## Backend

### Módulos

| Módulo         | Prefixo de Rota        | Responsabilidade                                    |
|----------------|------------------------|-----------------------------------------------------|
| `AuthModule`   | `/api/auth`            | Autenticação, emissão e revogação de sessões mobile |
| `UsersModule`  | —                      | Entidade User, provedor interno                     |
| `ClientsModule`| `/api/clientes`        | CRUD de clientes                                    |
| `OrdersModule` | `/api/pedidos`         | CRUD de pedidos e itens de pedido                   |
| `ProductsModule`| `/api/produtos`       | CRUD de produtos                                    |
| `SuppliersModule`| `/api/fornecedores`  | CRUD de fornecedores                                |
| `TransportModule`| `/api/transportadoras`| CRUD de transportadoras                            |
| `FinanceModule`| `/api/financeiro`      | Movimentações, comissões e inadimplências           |
| `SyncModule`   | `/api/sync`            | Sincronização bidirecional com app mobile           |

**Providers globais registrados no `AppModule`:**
- `APP_GUARD: JwtAuthGuard` — valida token em todas as rotas (exceto `@Public()`)
- `APP_GUARD: UserThrottlerGuard` — rate limit por `user.sub` (100 req/min padrão)
- `APP_INTERCEPTOR: TenantContextInterceptor` — popula CLS com `tenantId` extraído do JWT
- `APP_INTERCEPTOR: ResponseInterceptor` — envolve respostas de sucesso em `{ data: ... }`

---

### Autenticação

O sistema utiliza **dois tipos de tokens** JWT:

#### 1. ZonaDev RS256 (externo — frontend + autenticação inicial mobile)

- Emitido por `auth.zonadev.tech`
- Algoritmo: **RS256**
- Validado via JWKS: `ZONADEV_JWKS_URL`
- Claims esperados:
  - `iss`: `auth.zonadev.tech`
  - `aud`: `renowa.zonadev.tech`
  - `sub`: UUID do usuário
  - `tenantId`: UUID do tenant
  - `roles`: array de papéis (`ADMIN`, `VENDEDOR`, etc.)
  - `plan`: plano contratado

#### 2. Renowa HS256 (interno — sessões mobile)

- Emitido pelo backend em `POST /api/auth/mobile-session`
- Algoritmo: **HS256**
- Chave: `RENOWA_JWT_SECRET`
- Expiração: **30 dias**
- Claims:
  - `sub`, `tenantId`, `roles`, `plan` (copiados do ZonaDev token)
  - `tokenVersion`: incrementado ao revogar (invalidação seletiva)
  - `sessionUuid`: UUID único da sessão (rastreável)
  - `type: 'mobile'`

#### Fluxo completo

```
Mobile                    Backend                    ZonaDev Auth
  │                          │                           │
  │  1. Abre LoginScreen      │                           │
  │  (insere token ZonaDev)   │                           │
  │                          │                           │
  │  POST /auth/mobile-session│                           │
  │  Authorization: Bearer    │                           │
  │  <zonadev-token>  ───────►│                           │
  │                          │  2. Valida via JWKS ──────►│
  │                          │◄─────────────────── OK ───│
  │                          │  3. Cria MobileSession     │
  │                          │  4. Emite token HS256      │
  │◄── { token, user } ──────│                           │
  │                          │                           │
  │  5. Salva token no        │                           │
  │  expo-secure-store        │                           │
  │                          │                           │
  │  Requisições futuras:     │                           │
  │  Authorization: Bearer    │                           │
  │  <hs256-token>    ───────►│                           │
  │                          │  6. Valida internamente    │
  │◄── resposta ─────────────│                           │
```

#### JwtAuthGuard — lógica de validação

1. Extrai Bearer token do header `Authorization`
2. Tenta validar como **RS256** (via JWKS)
3. Se falhar, tenta validar como **HS256** (mobile session)
4. Verifica `tokenVersion` na tabela `mobile_sessions` (revogação)
5. Injeta `RequestUser` no contexto da requisição

---

### Banco de Dados

#### BaseEntity (herdada por todas as entidades)

```typescript
id         SERIAL PRIMARY KEY          -- ID interno (nunca exposto à API)
uuid       UUID DEFAULT gen_random_uuid() -- Identificador público
tenant_id  UUID NOT NULL               -- Isolamento multi-tenant
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
deleted_at TIMESTAMPTZ                 -- Soft delete (null = ativo)
```

> **Importante:** O mobile **sempre** usa `uuid` como referência — nunca `id`.
> A resolução UUID→ID ocorre no `SyncService` antes de qualquer INSERT/UPDATE.

#### Entidades principais

**User** (`users`)
```
email, nome
roles: string[]           -- ADMIN | VENDEDOR | FINANCEIRO | GESTAO
is_active: boolean
last_login_at: TIMESTAMPTZ
```

**MobileSession** (`mobile_sessions`)
```
user_uuid: UUID (FK)
token_version: integer    -- Incrementar invalida sessão imediatamente
device_info: string
last_seen_at: TIMESTAMPTZ
expires_at: TIMESTAMPTZ
is_active: boolean
```

**Client** (`clientes`)
```
razao_social, cnpj, email, tel
endereco, bairro, cidade, uf, cep, contato
inscricao_estadual, suframa
pgt_padrao, prazo, local_entrega, observacao
transportadora_id: FK → transportadoras
```

**Order** (`pedidos`)
```
numero_pedido: integer NULLABLE   -- Gerado pelo servidor via SEQUENCE
                                  -- NULL enquanto offline
cliente_id: FK → clientes
vendedor_id: FK → users
fornecedor_id: FK → fornecedores
transportadora_id: FK → transportadoras
data: DATE
status: 'em_aberto' | 'concluido' | 'cancelado'
total_sem_imposto, total_com_imposto: DECIMAL
pgt, prazo, local_entrega, observacao
UNIQUE (tenant_id, numero_pedido) WHERE numero_pedido IS NOT NULL
```

**OrderItem** (`itens_pedido`)
```
pedido_id: FK → pedidos
produto_id: FK → produtos (nullable — pode ser item manual)
codigo_manual, descricao_manual    -- Para itens sem produto cadastrado
qtd_caixas, qtd_unitaria: DECIMAL
preco_unitario, desconto_perc, total_item: DECIMAL
```

**Product** (`produtos`)
```
fornecedor_id: FK → fornecedores (nullable)
codigo, descricao
preco_base: DECIMAL
```

**Supplier** (`fornecedores`)
```
razao_social, cnpj
```

**Transport** (`transportadoras`)
```
razao_social, cnpj, telefone, endereco_completo
```

**FinanceMovement** (`movimentacoes_financeiras`)
```
tipo: 'Venda' | 'Custo Fixo' | 'Custo Rotativo'
valor: DECIMAL
data: DATE
descricao: string
```

**Commission** (`comissoes`)
```
pedido_id: FK → pedidos (nullable)
nfe: string
valor_faturado, perc_comissao, valor_comissao: DECIMAL   -- snapshot imutável
data_faturamento: DATE
```

**Inadimplencia** (`inadimplencias`)
```
cliente_id: FK → clientes
empresa_devedora: string
valor_aberto: DECIMAL
observacao: string
```

#### Índices relevantes

```sql
-- Presente em todas as tabelas (filtragem por tenant + identificador público)
INDEX (tenant_id, uuid)

-- Sincronização mobile (busca por última atualização)
INDEX (tenant_id, updated_at)
INDEX (tenant_id, deleted_at)

-- Pedidos — filtragem por status
INDEX (tenant_id, status)
```

---

### Endpoints da API

> Todas as rotas têm o prefixo `/api`. Exceto onde indicado `@Public`, é necessário JWT válido.

#### Health Check

```
GET /api/health               @Public
→ 200 OK
```

#### Auth

```
POST /api/auth/mobile-session          @Public  (throttle: 10 req/min)
  Authorization: Bearer <zonadev-token>
  Body: { device_info?: string }
  → { data: { token: string, user: MobileUser } }

DELETE /api/auth/mobile-session/:uuid
  → 204 No Content
```

#### Clientes

```
GET    /api/clientes?page&limit&search
POST   /api/clientes                   (ADMIN | VENDEDOR | GESTAO)
GET    /api/clientes/:uuid
PATCH  /api/clientes/:uuid             (ADMIN | VENDEDOR | GESTAO)
DELETE /api/clientes/:uuid             (ADMIN | GESTAO)  → 204
```

#### Pedidos

```
GET    /api/pedidos?page&limit&status&search
  ⚠ VENDEDOR vê apenas os próprios pedidos (WHERE vendedor_id = current_user)
POST   /api/pedidos                    (ADMIN | VENDEDOR | GESTAO)
GET    /api/pedidos/:uuid
PATCH  /api/pedidos/:uuid/status       (ADMIN | VENDEDOR | GESTAO)
DELETE /api/pedidos/:uuid              (ADMIN | GESTAO)  → 204
```

#### Produtos

```
GET    /api/produtos?page&limit&search
POST   /api/produtos                   (ADMIN | VENDEDOR | GESTAO)
GET    /api/produtos/:uuid
PATCH  /api/produtos/:uuid             (ADMIN | VENDEDOR | GESTAO)
DELETE /api/produtos/:uuid             (ADMIN | GESTAO)  → 204
```

#### Fornecedores

```
GET    /api/fornecedores?page&limit
POST   /api/fornecedores               (ADMIN | VENDEDOR | GESTAO)
GET    /api/fornecedores/:uuid
PATCH  /api/fornecedores/:uuid         (ADMIN | VENDEDOR | GESTAO)
DELETE /api/fornecedores/:uuid         (ADMIN | GESTAO)  → 204
```

#### Transportadoras

```
GET    /api/transportadoras?page&limit&search
POST   /api/transportadoras            (ADMIN | VENDEDOR | GESTAO)
GET    /api/transportadoras/:uuid
PATCH  /api/transportadoras/:uuid      (ADMIN | VENDEDOR | GESTAO)
DELETE /api/transportadoras/:uuid      (ADMIN | GESTAO)  → 204
```

#### Financeiro

> Todas as rotas exigem papel `ADMIN`, `FINANCEIRO` ou `GESTAO`.

```
GET    /api/financeiro/dashboard
GET    /api/financeiro/fluxo-caixa?mes&ano

# Lançamentos (alias: /movimentacoes)
GET    /api/financeiro/lancamentos?page&limit&tipo&mes&ano
POST   /api/financeiro/lancamentos
GET    /api/financeiro/lancamentos/:uuid
PATCH  /api/financeiro/lancamentos/:uuid
DELETE /api/financeiro/lancamentos/:uuid                → 204

# Comissões
GET    /api/financeiro/comissoes/resumo?mes&ano
GET    /api/financeiro/comissoes/por-empresa?fornecedor_id&mes&ano
GET    /api/financeiro/comissoes?page&limit&fornecedor_id&mes&ano&status
POST   /api/financeiro/comissoes
PATCH  /api/financeiro/comissoes/:uuid
DELETE /api/financeiro/comissoes/:uuid                  → 204

# Parceiros Comerciais
GET    /api/financeiro/parceiros?page&limit&nome_parceiro&mes&ano
POST   /api/financeiro/parceiros
PATCH  /api/financeiro/parceiros/:uuid
DELETE /api/financeiro/parceiros/:uuid                  → 204

# Inadimplência
GET    /api/financeiro/inadimplencia?page&limit
POST   /api/financeiro/inadimplencia
PATCH  /api/financeiro/inadimplencia/:uuid
DELETE /api/financeiro/inadimplencia/:uuid              → 204
```

#### Sync (Mobile)

> Throttle: 30 req/min.

```
POST /api/sync
  Body: { items: SyncItemDto[] }    (máx. 200 itens por requisição)
  → { results: SyncItemResult[], server_time: ISO8601 }

GET /api/sync/clientes?since=ISO&cursor=0&limit=200
GET /api/sync/pedidos?since=ISO&cursor=0&limit=200
GET /api/sync/produtos?since=ISO&cursor=0&limit=200
GET /api/sync/fornecedores?since=ISO&cursor=0&limit=200
GET /api/sync/transportadoras?since=ISO&cursor=0&limit=200
GET /api/sync/itens-pedido?since=ISO&cursor=0&limit=200
```

---

### Formato de Resposta

#### Resposta padrão (sucesso)

```json
{
  "data": { }
}
```

#### Resposta paginada

```json
{
  "data": [ ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

#### Resposta de sincronização (POST /api/sync)

```json
{
  "results": [
    { "uuid": "abc-123", "status": "ok", "id": 42, "numero_pedido": 7 },
    { "uuid": "def-456", "status": "error", "message": "Cliente não encontrado" }
  ],
  "server_time": "2026-02-25T18:00:00.000Z"
}
```

#### Resposta de pull (GET /api/sync/:entity)

```json
{
  "data": [ ],
  "meta": {
    "total": 500,
    "hasMore": true,
    "nextCursor": 200,
    "server_time": "2026-02-25T18:00:00.000Z"
  }
}
```

---

### Rate Limiting

| Contexto                     | Limite          | Chave          |
|------------------------------|-----------------|----------------|
| Global (rotas autenticadas)  | 100 req/min     | `user.sub`     |
| `POST /auth/mobile-session`  | 10 req/min      | IP             |
| Rotas `/api/sync`            | 30 req/min      | `user.sub`     |

O `UserThrottlerGuard` usa `user.sub` como chave quando autenticado e faz fallback para IP para rotas públicas.

---

### Tratamento de Erros

Todos os erros seguem o formato padronizado:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cliente com uuid 'abc-123' não encontrado",
    "timestamp": "2026-02-25T18:00:00.000Z",
    "path": "/api/clientes/abc-123"
  }
}
```

Códigos de erro mapeados do HTTP status:

| HTTP Status | `code`              |
|-------------|---------------------|
| 400         | `BAD_REQUEST`       |
| 401         | `UNAUTHORIZED`      |
| 403         | `FORBIDDEN`         |
| 404         | `NOT_FOUND`         |
| 409         | `CONFLICT`          |
| 422         | `UNPROCESSABLE`     |
| 429         | `TOO_MANY_REQUESTS` |
| 500         | `INTERNAL_ERROR`    |

Erros de validação (400) incluem lista de campos inválidos no `message`.

---

## Frontend

### Estrutura de Telas

| Rota               | Componente          | Roles que podem acessar    |
|--------------------|---------------------|----------------------------|
| `/`                | Dashboard           | Todos                      |
| `/clientes`        | Clientes            | Todos                      |
| `/pedidos`         | Pedidos             | Todos                      |
| `/produtos`        | Produtos            | Todos                      |
| `/transporte`      | Transporte          | Todos                      |
| `/financeiro`      | Financeiro          | ADMIN, FINANCEIRO, GESTAO  |
| `/configuracoes`   | Configuracoes       | ADMIN                      |

### Gerenciamento de Estado

#### `authStore` (Zustand)

```typescript
interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  setUser(user: AuthUser): void;
  clearAuth(): void;
  logout(): void;           // Redireciona para ZonaDev logout
  hasRole(role: string): boolean;
  hasAnyRole(roles: string[]): boolean;
}
```

#### `AuthUser` (payload do token ZonaDev)

```typescript
interface AuthUser {
  sub: string;              // UUID do usuário
  email: string;
  roles: string[];
  tenantId: string;
  tenantSubdomain: string;
  plan: string;
}
```

### Fluxo de Autenticação Web

1. `ProtectedRoute` verifica se há sessão ativa via `GET {VITE_AUTH_URL}/api/auth/me` (com `withCredentials: true`)
2. Em caso de sucesso: popula `authStore.user` e renderiza a página
3. Em caso de falha (401): redireciona para `{VITE_AUTH_URL}/login?aud={VITE_AUTH_AUD}&redirect={url_atual}`
4. Interceptor do Axios captura qualquer 401 subsequente e repete o processo

---

## Mobile

### Arquitetura Offline-First

O app mobile foi construído para funcionar **sem conexão com internet**. Toda criação/edição de dados é salva primeiro no SQLite local e enviada ao servidor quando houver conectividade.

#### Fluxo de operação

```
Usuário cria pedido (offline)
        │
        ▼
INSERT no SQLite local
 (synced = 0, operation = 'CREATE')
        │
        ▼
Conectou à internet?
        │
       Sim
        │
        ▼
SyncService.syncPendingItems()
 POST /api/sync com até 200 itens
        │
        ▼
Backend processa e retorna
{ results: [...], server_time }
        │
        ▼
Atualiza SQLite:
 synced = 1
 numero_pedido = retornado pelo servidor
        │
        ▼
SyncService.fetchDeltas(since)
 GET /api/sync/:entity?since=...
        │
        ▼
Aplica deltas no SQLite local
(novos registros, atualizações, soft deletes)
```

### Sincronização Bidirecional

#### Push (enviar alterações locais)

```typescript
// SyncItemDto enviado ao servidor
interface SyncItemDto {
  uuid: string;                        // UUID local do registro
  entity: 'clientes' | 'pedidos' | 'produtos' | 'fornecedores' | 'transportadoras' | 'itens-pedido';
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;    // Dados com _uuid como referência a FKs
  client_timestamp: string;            // ISO8601 — para resolução de conflitos LWW
}
```

**Estratégias aplicadas:**
- **Idempotência**: CREATE com UUID já existente retorna o registro existente (sem erro)
- **Resolução UUID→ID**: o backend resolve os campos `*_uuid` para IDs internos antes do INSERT
- **LWW (Last Write Wins)**: se `banco.updated_at > client_timestamp`, a atualização é descartada
- **`numero_pedido`**: gerado somente pelo servidor via SEQUENCE — o mobile usa UUID até sincronizar
- **Transação por item**: falha em um item não bloqueia os demais

#### Pull (buscar alterações do servidor)

```
Paginação por cursor numérico (offset):
  GET /api/sync/clientes?since=2026-01-01T00:00:00Z&cursor=0&limit=200
  → { data: [...200 itens], meta: { hasMore: true, nextCursor: 200 } }

  GET /api/sync/clientes?since=...&cursor=200&limit=200
  → { data: [...200 itens], meta: { hasMore: false } }
```

> O `server_time` retornado em `meta` é usado como âncora para o próximo pull. O mobile **nunca usa `Date.now()`** para evitar problemas de fuso horário e clock skew.

**Retry com backoff exponencial:**
- Falha na sincronização: aguarda 1s → tenta novamente
- Segunda falha: aguarda 2s → tenta novamente
- Terceira falha: aguarda 4s → tenta novamente

### Banco de Dados Local

O SQLite local (`renowa.db`) espelha as tabelas do servidor com colunas adicionais de controle:

```sql
-- Tabelas espelhadas (todas com coluna synced)
fornecedores     (uuid, tenant_id, razao_social, cnpj, ..., synced)
transportadoras  (uuid, tenant_id, razao_social, cnpj, ..., synced)
clientes         (uuid, tenant_id, razao_social, ..., transportadora_uuid, synced)
produtos         (uuid, tenant_id, codigo, descricao, preco_base, ..., synced)
pedidos          (uuid, tenant_id, numero_pedido, cliente_uuid, ..., status, synced)
itens_pedido     (uuid, tenant_id, pedido_uuid, produto_uuid, ..., synced)

-- Fila de operações pendentes
sync_queue (
  uuid            TEXT NOT NULL,
  entity          TEXT NOT NULL,
  operation       TEXT NOT NULL,   -- CREATE | UPDATE | DELETE
  payload         TEXT NOT NULL,   -- JSON
  client_timestamp TEXT NOT NULL,  -- ISO8601
  retry_count     INTEGER DEFAULT 0
)

-- Metadados de sincronização
sync_meta (
  key   TEXT PRIMARY KEY,          -- ex: 'last_sync_timestamp'
  value TEXT
)
```

---

## Multi-Tenancy

Toda a isolação de dados é feita via coluna `tenant_id` (UUID) presente em **todas** as tabelas.

```
Fluxo:
  1. JwtAuthGuard extrai { sub, tenantId, roles } do JWT
  2. TenantContextInterceptor armazena tenantId no CLS (Context Local Storage)
  3. TenantSubscriber (TypeORM) injeta automaticamente tenant_id em todo INSERT
  4. Todas as queries incluem WHERE tenant_id = :tenantId via subscriber
```

Isso garante isolamento completo sem a necessidade de schemas separados por tenant.

---

## Papéis e Permissões

| Recurso                  | ADMIN | VENDEDOR | FINANCEIRO | GESTAO |
|--------------------------|:-----:|:--------:|:----------:|:------: |
| Ver clientes             |  ✓    |    ✓     |     ✓      |   ✓   |
| Criar/editar clientes    |  ✓    |    ✓     |            |   ✓    |
| Deletar clientes         |  ✓    |          |            |   ✓    |
| Ver pedidos              |  ✓    | só seus  |     ✓      |   ✓    |
| Criar/editar pedidos     |  ✓    |    ✓     |            |   ✓    |
| Deletar pedidos          |  ✓    |          |            |   ✓    |
| Ver produtos             |  ✓    |    ✓     |     ✓      |   ✓    |
| Criar/editar produtos    |  ✓    |    ✓     |            |   ✓    |
| Deletar produtos         |  ✓    |          |            |   ✓    |
| Ver/criar fornecedores   |  ✓    |    ✓     |            |   ✓    |
| Deletar fornecedores     |  ✓    |          |            |   ✓    |
| Ver/criar transportadoras|  ✓    |    ✓     |            |   ✓    |
| Deletar transportadoras  |  ✓    |          |            |   ✓    |
| Módulo financeiro        |  ✓    |          |     ✓      |   ✓    |
| Configurações            |  ✓    |          |            |        |

> **VENDEDOR** vê apenas os pedidos onde ele é o `vendedor_id`.

---

## Esquema do Banco de Dados

```
┌──────────────────────────────────────────────────────────────────────┐
│                          DIAGRAMA ER (simplificado)                  │
│                                                                      │
│  users ──────────────────────────────────────────┐                   │
│    │                                              │                  │
│    │ (vendedor_id)                                │ (user_uuid)      │
│    ▼                                              ▼                  │
│  pedidos ◄──────────── itens_pedido          mobile_sessions         │
│    │  │  │                  │                                        │
│    │  │  │                  └──► produtos ──► fornecedores           │
│    │  │  │                                                           │
│    │  │  └──► transportadoras ◄───────────── clientes                │
│    │  │                                          │                   │
│    │  └──────────────────────────────────────────┘                   │
│    │         (cliente_id)                                            │
│    │                                                                 │
│    ├──► comissoes ──► clientes / fornecedores                        │
│    │                                                                 │
│  parceiros_comerciais ──► clientes / fornecedores                    │
│  inadimplencias ──► clientes                                         │
│  movimentacoes_financeiras (independente)                            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Padrões Arquiteturais

### UUID como identificador público

- APIs REST sempre recebem e retornam `uuid`
- IDs internos (`SERIAL`) nunca são expostos
- Mobile referencia FKs como `cliente_uuid`, `pedido_uuid`, etc.
- O backend resolve `uuid → id` antes de persistir

### Soft Delete

- Nenhum registro é deletado fisicamente
- `DELETE /api/:entity/:uuid` → `UPDATE SET deleted_at = now()`
- Queries sempre incluem `WHERE deleted_at IS NULL`
- O mobile recebe registros deletados via sync (com `deleted_at` preenchido) para remover localmente

### Resposta envelopada

- Sucesso: `{ data: ... }`
- Paginação: `{ data: [], meta: { total, page, limit, totalPages } }`
- Sync pull: `{ data: [], meta: { total, hasMore, nextCursor, server_time } }`
- Erro: `{ error: { code, message, timestamp, path } }`

### TypeScript strict mode

Todos os workspaces utilizam `"strict": true` no `tsconfig.json`.

---

*Projeto desenvolvido com foco em vendas externas, operação offline e gestão comercial multi-tenant.*
