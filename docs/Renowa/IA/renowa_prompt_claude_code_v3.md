# Prompt Master v3.0 — Sistema Renowa
> Jogar diretamente no Claude Code na pasta raiz vazia do projeto

---

Você é um desenvolvedor sênior full-stack. Vou te passar toda a especificação de um sistema e quero que você inicie a estrutura completa do projeto seguindo as decisões arquiteturais já definidas. Leia tudo com atenção antes de escrever qualquer código.

---

## CONTEXTO DO PROJETO

Sistema de gestão comercial interno chamado **Sistema Renowa**, para uso exclusivo da equipe da Renowa Representações. Funciona em três partes separadas dentro de um monorepo:

- `backend/` → API NestJS (servidor)
- `frontend/` → Interface React no navegador
- `mobile/` → App React Native no celular

O mobile precisa funcionar **offline**, sincronizando ao recuperar conexão.

---

## STACK TECNOLÓGICA (DEFINITIVA — não sugerir alternativas)

**Backend:**
- Node.js + NestJS
- TypeORM como ORM
- PostgreSQL (banco de dados)
- Railway (hospedagem — não configurar agora, estruturar apenas para deploy fácil)

**Frontend:**
- React + Vite + TypeScript
- Tailwind CSS
- shadcn/ui (componentes)
- Recharts (gráficos)
- @react-pdf/renderer (geração de PDF)
- axios (HTTP client)
- React Router v6

**Mobile:**
- React Native + Expo + TypeScript
- expo-sqlite (storage offline)
- @react-native-community/netinfo (detecção de rede)
- axios (HTTP client)

---

## IDENTIDADE VISUAL

- Cor primária: `#2A9D8F` (Verde Teal)
- Cor secundária: `#FFFFFF` (Branco)
- Fundo da aplicação: `#F4F7F6` (Off-white)
- Botões principais: Verde teal com texto branco
- Tipografia: Inter (sans-serif)
- Logo: arquivo `Logo.jpg` (será fornecido — reservar espaço no layout)

---

## ESTRUTURA DE PASTAS DO MONOREPO

```
renowa/
├── backend/
│   └── src/
│       ├── clients/        ← Módulo Clientes
│       ├── orders/         ← Módulo Pedidos
│       ├── products/       ← Módulo Produtos
│       ├── suppliers/      ← Módulo Fornecedores
│       ├── finance/        ← Módulo Financeiro
│       ├── transport/      ← Módulo Transportadoras
│       ├── sync/           ← Módulo crítico de sincronização
│       ├── auth/           ← Autenticação JWT
│       └── common/         ← DTOs, interceptors, guards compartilhados
├── frontend/
│   └── src/
│       ├── pages/          ← Clientes, Pedidos, Financeiro, Produtos, Transporte
│       ├── components/     ← Sidebar, Header, Tabelas, Forms, Modais
│       ├── services/       ← Camada de API (axios)
│       ├── hooks/          ← Custom hooks
│       └── assets/         ← Logo e imagens
└── mobile/
    └── src/
        ├── screens/        ← Telas do app
        ├── storage/        ← SQLite + sync_queue
        └── services/       ← SyncService, ApiService
```

---

## PADRÃO DE RESPOSTA DA API (obrigatório em todos os endpoints)

### Listagem paginada:
```json
{
  "data": [],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

### Registro único:
```json
{
  "data": { }
}
```

### Erro:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Cliente não encontrado.",
    "timestamp": "2026-02-25T18:00:00.000Z"
  }
}
```

Criar um `GlobalExceptionHandler` (NestJS ExceptionFilter) que garanta este padrão em todos os erros.
Criar um `ResponseInterceptor` que envolva automaticamente todas as respostas de sucesso no formato `{ data: ... }`.

---

## REGRAS DE LISTAGEM (obrigatório em todos os endpoints GET de lista)

Todos os endpoints de listagem devem:
1. Filtrar automaticamente `deleted_at IS NULL` — nunca retornar registros deletados
2. Implementar paginação com query params `page` (default: 1) e `limit` (default: 20, **máximo: 100**)
   - Se `limit > 100` for recebido → retornar erro 400: "limit não pode exceder 100"
3. Retornar o total de registros no campo `meta.total`
4. Aceitar filtro de busca via query param `search` onde aplicável
5. **Ordenação padrão: `created_at DESC`** — registro mais recente primeiro
   - Aceitar query params opcionais: `sort` (nome do campo) e `order` (`ASC` | `DESC`)
   - Exemplo: `GET /clientes?sort=razao_social&order=ASC`
   - Validar `sort` contra whitelist por entidade — nunca interpolar string direta em SQL

---

## TIMESTAMPS E TIMEZONE (regra crítica)

- **Todos os timestamps devem ser armazenados e comparados em UTC**
- Configurar TypeORM com `timezone: 'UTC'`
- O PostgreSQL deve usar `TIMESTAMP WITH TIME ZONE` em todos os campos de data/hora
- O mobile deve sempre enviar timestamps em formato ISO 8601 com sufixo `Z` (UTC)
- A comparação de conflito no sync usa `updated_at` UTC vs `updated_at` UTC recebido

---

## MODELO DE DADOS COMPLETO

### Regras obrigatórias para TODAS as tabelas PostgreSQL:
1. `uuid UUID UNIQUE NOT NULL` — gerado pelo cliente (web ou mobile), nunca pelo banco
2. `created_at TIMESTAMPTZ DEFAULT now()`
3. `updated_at TIMESTAMPTZ DEFAULT now()` — atualizado via trigger automático (nunca manual)
4. `deleted_at TIMESTAMPTZ NULL` — soft delete (NULL = ativo, preenchido = excluído)

### Tabelas Core:

**usuarios**
```
id            SERIAL PRIMARY KEY
uuid          UUID UNIQUE NOT NULL
email         VARCHAR UNIQUE NOT NULL
nome          VARCHAR NOT NULL
senha_hash    VARCHAR NOT NULL
role          VARCHAR NOT NULL DEFAULT 'vendedor'  -- 'admin' | 'vendedor'
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ NULL
```

**clientes**
```
id                  SERIAL PRIMARY KEY
uuid                UUID UNIQUE NOT NULL
razao_social        VARCHAR NOT NULL
cnpj                VARCHAR
email               VARCHAR
tel                 VARCHAR
endereco            VARCHAR
bairro              VARCHAR
cidade              VARCHAR
uf                  VARCHAR(2)
cep                 VARCHAR
contato             VARCHAR
inscricao_estadual  VARCHAR
suframa             VARCHAR
pgt_padrao          VARCHAR   -- condição de pagamento padrão
prazo               VARCHAR
local_entrega       VARCHAR
observacao          TEXT
transportadora_id   INTEGER REFERENCES transportadoras(id)
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
deleted_at          TIMESTAMPTZ NULL
```

**transportadoras**
```
id                SERIAL PRIMARY KEY
uuid              UUID UNIQUE NOT NULL
razao_social      VARCHAR NOT NULL
cnpj              VARCHAR
telefone          VARCHAR
endereco_completo TEXT
created_at        TIMESTAMPTZ DEFAULT now()
updated_at        TIMESTAMPTZ DEFAULT now()
deleted_at        TIMESTAMPTZ NULL
```

**fornecedores**
```
id            SERIAL PRIMARY KEY
uuid          UUID UNIQUE NOT NULL
razao_social  VARCHAR NOT NULL
cnpj          VARCHAR
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ NULL
```

**produtos**
```
id             SERIAL PRIMARY KEY
uuid           UUID UNIQUE NOT NULL
fornecedor_id  INTEGER REFERENCES fornecedores(id)
codigo         VARCHAR
descricao      VARCHAR NOT NULL
preco_base     DECIMAL(10,2)
created_at     TIMESTAMPTZ DEFAULT now()
updated_at     TIMESTAMPTZ DEFAULT now()
deleted_at     TIMESTAMPTZ NULL
```

### Tabelas de Movimentação:

**pedidos**
```
id                  SERIAL PRIMARY KEY
uuid                UUID UNIQUE NOT NULL
numero_pedido       INTEGER UNIQUE  -- gerado EXCLUSIVAMENTE pelo servidor, NULL até sync
cliente_id          INTEGER REFERENCES clientes(id)
vendedor_id         INTEGER REFERENCES usuarios(id)
fornecedor_id       INTEGER REFERENCES fornecedores(id)
data                DATE
status              VARCHAR DEFAULT 'em_aberto'  -- 'em_aberto' | 'concluido' | 'cancelado'
total_sem_imposto   DECIMAL(10,2)
total_com_imposto   DECIMAL(10,2)
pgt                 VARCHAR
prazo               VARCHAR
local_entrega       VARCHAR
observacao          TEXT
created_at          TIMESTAMPTZ DEFAULT now()
updated_at          TIMESTAMPTZ DEFAULT now()
deleted_at          TIMESTAMPTZ NULL
```

**itens_pedido**
```
id               SERIAL PRIMARY KEY
uuid             UUID UNIQUE NOT NULL
pedido_id        INTEGER REFERENCES pedidos(id)
produto_id       INTEGER REFERENCES produtos(id) NULL  -- NULL se produto não cadastrado
codigo_manual    VARCHAR    -- para produtos não cadastrados
descricao_manual VARCHAR    -- para produtos não cadastrados
qtd_caixas       DECIMAL(10,3)
qtd_unitaria     DECIMAL(10,3)
preco_unitario   DECIMAL(10,2)
desconto_perc    DECIMAL(5,2)
total_item       DECIMAL(10,2)
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
deleted_at       TIMESTAMPTZ NULL
```

### Tabelas Financeiras:

**financeiro_movimentacao**
```
id          SERIAL PRIMARY KEY
uuid        UUID UNIQUE NOT NULL
tipo        VARCHAR NOT NULL  -- 'Custo Fixo' | 'Custo Rotativo' | 'Venda'
valor       DECIMAL(10,2)
data        DATE
descricao   VARCHAR
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
deleted_at  TIMESTAMPTZ NULL
```

**comissoes**
```
id                SERIAL PRIMARY KEY
uuid              UUID UNIQUE NOT NULL
pedido_id         INTEGER REFERENCES pedidos(id)
nfe               VARCHAR
valor_faturado    DECIMAL(10,2)
perc_comissao     DECIMAL(5,2)
valor_comissao    DECIMAL(10,2)  -- calculado automaticamente: valor_faturado * perc_comissao / 100
data_faturamento  DATE
created_at        TIMESTAMPTZ DEFAULT now()
updated_at        TIMESTAMPTZ DEFAULT now()
```

**inadimplencia**
```
id               SERIAL PRIMARY KEY
uuid             UUID UNIQUE NOT NULL
cliente_id       INTEGER REFERENCES clientes(id)
empresa_devedora VARCHAR
valor_aberto     DECIMAL(10,2)
observacao       TEXT
created_at       TIMESTAMPTZ DEFAULT now()
updated_at       TIMESTAMPTZ DEFAULT now()
deleted_at       TIMESTAMPTZ NULL
```

---

## ÍNDICES OBRIGATÓRIOS

Criar em todas as tabelas sincronizáveis:

```sql
-- Padrão para cada tabela:
CREATE INDEX idx_<tabela>_uuid       ON <tabela>(uuid);
CREATE INDEX idx_<tabela>_updated_at ON <tabela>(updated_at);
CREATE INDEX idx_<tabela>_deleted_at ON <tabela>(deleted_at);

-- Índices de chave estrangeira (FK) — obrigatórios para performance em JOINs e relatórios:
CREATE INDEX idx_pedidos_cliente_id   ON pedidos(cliente_id);
CREATE INDEX idx_pedidos_vendedor_id  ON pedidos(vendedor_id);
CREATE INDEX idx_pedidos_fornecedor_id ON pedidos(fornecedor_id);
CREATE INDEX idx_itens_pedido_pedido_id ON itens_pedido(pedido_id);
CREATE INDEX idx_itens_pedido_produto_id ON itens_pedido(produto_id);
CREATE INDEX idx_produtos_fornecedor_id ON produtos(fornecedor_id);
CREATE INDEX idx_clientes_transportadora_id ON clientes(transportadora_id);
CREATE INDEX idx_comissoes_pedido_id  ON comissoes(pedido_id);
CREATE INDEX idx_inadimplencia_cliente_id ON inadimplencia(cliente_id);

-- Índice adicional para numero_pedido (usado em buscas frequentes):
CREATE INDEX idx_pedidos_numero ON pedidos(numero_pedido);
```

---

## TRIGGER updated_at (criar uma vez, aplicar em todas as tabelas)

```sql
-- Função reutilizável:
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em cada tabela:
CREATE TRIGGER trg_<tabela>_updated_at
BEFORE UPDATE ON <tabela>
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## REGRA CRÍTICA — numero_pedido

```
numero_pedido deve ser sequencial global incremental, iniciado em 1.
Deve ser gerado dentro de uma transação de banco para evitar concorrência.
```

Implementação obrigatória no backend:

```sql
-- Criar SEQUENCE dedicada no PostgreSQL (mais robusto que SELECT MAX — sem lock de tabela):
CREATE SEQUENCE pedidos_numero_seq START 1 INCREMENT 1;
```

```typescript
// No SyncService, ao processar CREATE de pedido:
// 1. SELECT nextval('pedidos_numero_seq')  ← atômico, sem concorrência, sem lock de tabela
// 2. Atribuir o valor retornado como numero_pedido
// 3. INSERT do pedido com esse numero_pedido
// Não precisa de transaction exclusiva — nextval() é atômico por natureza no PostgreSQL
```

Regras:
- **Global** — um único contador para todos os fornecedores e vendedores
- **Iniciado em 1** — primeiro pedido recebe numero_pedido = 1
- **Atômico** — SEQUENCE do PostgreSQL garante unicidade mesmo com múltiplas conexões simultâneas
- **Nunca gerado no mobile** — mobile cria pedido offline sem numero_pedido (fica NULL no SQLite)
- **Atribuído pelo servidor** na chegada via sync e retornado ao mobile
- **Nota técnica**: SELECT MAX + FOR UPDATE funcionaria para projeto solo, mas SEQUENCE é a abordagem correta para qualquer volume

---

## MÓDULO DE SINCRONIZAÇÃO OFFLINE (crítico)

### Tabelas SQLite Mobile (NUNCA replicar no PostgreSQL):

**sync_queue** — fila de operações pendentes
```sql
CREATE TABLE sync_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade   TEXT NOT NULL,         -- 'clientes' | 'pedidos' | 'itens_pedido' | etc.
  uuid       TEXT NOT NULL,
  operacao   TEXT NOT NULL,         -- 'CREATE' | 'UPDATE' | 'DELETE'
  payload    TEXT NOT NULL,         -- JSON serializado do registro completo
  status     TEXT DEFAULT 'pendente', -- 'pendente' | 'enviado'
  created_at TEXT DEFAULT (datetime('now'))
);
```

**sync_meta** — metadados de sincronização
```sql
CREATE TABLE sync_meta (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  chave TEXT UNIQUE NOT NULL,
  valor TEXT
);
-- Inserir registro inicial:
INSERT INTO sync_meta (chave, valor) VALUES ('last_sync_timestamp', NULL);
```

### Endpoint POST /api/sync

Recebe do mobile:
```json
{
  "items": [
    {
      "entidade": "clientes",
      "uuid": "a82f-92aa-...",
      "operacao": "CREATE",
      "payload": { ... },
      "updated_at": "2026-02-25T18:00:00.000Z"
    }
  ]
}
```

Lógica de processamento (para cada item):
1. Buscar no PostgreSQL pelo `uuid`
2. **Conflito — Last Write Wins em UTC**: se banco tiver `updated_at` mais recente que o recebido → descartar, retornar registro atual
3. Se não existe → criar (para operação CREATE)
4. Se existe e recebido é mais recente → atualizar
5. Para operação DELETE → setar `deleted_at = now()` (soft delete)
6. Para pedidos novos (CREATE) → gerar `numero_pedido` dentro de transação
7. Retornar resultado de cada item processado

Retorna:
```json
{
  "data": {
    "processed": [
      {
        "uuid": "a82f-92aa-...",
        "id": 105,
        "numero_pedido": 42,   // apenas para pedidos
        "status": "ok"         // "ok" | "conflict" | "error"
      }
    ]
  }
}
```

### Endpoint GET /api/sync?since=timestamp

- Retorna apenas registros com `updated_at > since` (deltas)
- Inclui registros com `deleted_at` preenchido e recente (para mobile saber o que remover)
- Cobre entidades: **clientes, produtos, transportadoras, fornecedores, pedidos, itens_pedido**
  - Pedidos e itens_pedido são incluídos para que um vendedor logando em outro dispositivo receba seus pedidos
- `since` deve ser interpretado como UTC
- Retorna:
```json
{
  "data": {
    "clientes": [...],
    "produtos": [...],
    "transportadoras": [...],
    "fornecedores": [...],
    "pedidos": [...],
    "itens_pedido": [...]
  }
}
```

### SyncService no Mobile

Criar `mobile/src/services/SyncService.ts` com:
- Listener NetInfo que detecta transição offline → online
- `syncPendingItems()` — processa sync_queue e envia POST /api/sync
- `fetchDeltas()` — busca GET /api/sync?since=last_sync_timestamp
- `updateLastSyncTimestamp()` — salva timestamp em UTC no sync_meta
- Retry com backoff exponencial em caso de falha de rede (máx 3 tentativas: 1s, 2s, 4s)
- Cleanup correto do listener NetInfo ao desmontar

---

## AUTENTICAÇÃO

- JWT (jsonwebtoken) com expiração de 8 horas
- Dois roles: `admin` e `vendedor`
- Endpoint: `POST /auth/login` → retorna `{ data: { token, user } }`
- Todos os outros endpoints requerem header `Authorization: Bearer <token>`
- Criar `JwtAuthGuard` e decorator `@CurrentUser()` para usar nos controllers
- Admin tem acesso total; vendedor vê apenas seus próprios pedidos nos relatórios

---

## ESTRUTURA DE NAVEGAÇÃO DO FRONTEND

Layout de três zonas:
1. **Sidebar esquerda** — logo Renowa + menu de navegação com ícones e labels
2. **Header superior** — busca rápida + nome e role do usuário logado
3. **Área central** — conteúdo de cada módulo

Menu lateral (nesta ordem):
1. Dashboard (Indicadores)
2. Clientes
3. Pedidos
4. Financeiro
5. Produtos
6. Transporte
7. Configurações (visível apenas para admin)

---

## O QUE FAZER AGORA — FASE 1

### 1. Backend — NestJS completo

- [ ] Inicializar projeto NestJS com TypeORM + PostgreSQL + TypeScript
- [ ] Criar todos os módulos com estrutura (module, controller, service, entity, dto)
- [ ] Criar todas as entities TypeORM com os campos exatos definidos acima
- [ ] Criar script SQL de migração completo: tabelas + índices + trigger set_updated_at
- [ ] Criar módulo Auth com JWT (login, JwtAuthGuard, @CurrentUser)
- [ ] Criar CRUD completo para: Clientes, Transportadoras, Fornecedores, Produtos
  - Todos os GETs de lista com paginação (page, limit, search) e filtro deleted_at IS NULL
  - Todos os DELETEs com soft delete (setar deleted_at)
- [ ] Criar estrutura do módulo Sync (POST /api/sync e GET /api/sync?since=)
- [ ] Criar GlobalExceptionHandler com padrão de erro definido acima
- [ ] Criar ResponseInterceptor que envolve respostas de sucesso em `{ data: ... }`
- [ ] Configurar CORS para aceitar requisições do frontend e mobile
- [ ] Configurar .env com: DATABASE_URL, JWT_SECRET, PORT

### 2. Frontend — React + Vite

- [ ] Inicializar projeto com Vite + React + TypeScript
- [ ] Instalar e configurar Tailwind CSS com cores da Renowa (primary: #2A9D8F, bg: #F4F7F6)
- [ ] Instalar e configurar shadcn/ui
- [ ] Criar layout base (Sidebar + Header + área de conteúdo)
- [ ] Criar tela de Login com validação e feedback de erro
- [ ] Criar serviço de API (axios) com:
  - Interceptor que injeta JWT no header Authorization
  - Interceptor que trata 401 (redireciona para login)
  - AbortController para cancelar requests anteriores em buscas
- [ ] Criar página de Clientes com:
  - Tabela paginada (razão social, CNPJ, cidade, UF, telefone)
  - Botão "Incluir" no canto superior direito
  - Modal com formulário de cadastro completo (todos os campos definidos)
  - Busca por nome, razão social ou CNPJ com debounce de 300ms
  - Estados de loading (skeleton), erro e vazio
- [ ] Configurar React Router v6 com rotas protegidas (redireciona para login se sem JWT)

### 3. Mobile — React Native + Expo

- [ ] Inicializar projeto Expo com TypeScript
- [ ] Configurar expo-sqlite e criar schema completo (espelho das tabelas core + sync_queue + sync_meta)
- [ ] Criar SyncService conforme especificado acima
- [ ] Criar tela de Login
- [ ] Criar tela de listagem de Pedidos (lê do SQLite local)
- [ ] Criar tela de criação de Pedido com suporte offline:
  - Gera UUID localmente ao criar
  - Salva no SQLite sem numero_pedido (fica NULL)
  - Entra na sync_queue com operacao = 'CREATE'

### 4. Infraestrutura

- [ ] `docker-compose.yml` com PostgreSQL para desenvolvimento local (porta 5432)
- [ ] `.env.example` com todas as variáveis documentadas
- [ ] `README.md` na raiz com: pré-requisitos, como rodar cada parte, estrutura do projeto

### 5. Testes — Jest básico

- [ ] Testes unitários para AuthService (login com credenciais válidas e inválidas)
- [ ] Testes unitários para ClientesService (create, findAll com paginação, soft delete)
- [ ] Usar mocks do TypeORM Repository

---

## REGRAS DE DESENVOLVIMENTO (seguir rigorosamente)

1. **NUNCA** conectar frontend diretamente ao banco — sempre via API
2. **NUNCA** usar ID sequencial em registros criados offline — usar UUID (campo `uuid`)
3. **NUNCA** gerar `numero_pedido` no mobile — gerado exclusivamente pelo servidor dentro de transação
4. **SEMPRE** incluir `created_at`, `updated_at` (via trigger) e `deleted_at` em toda tabela
5. **Soft delete obrigatório** — nunca DELETE físico, sempre setar `deleted_at`
6. **Índices obrigatórios** em `uuid`, `updated_at` e `deleted_at` em todas as tabelas
7. **Conflito de sync**: Last Write Wins baseado em `updated_at` UTC
8. **sync_queue e sync_meta** existem APENAS no SQLite do mobile — nunca no PostgreSQL
9. **Todos os timestamps em UTC** — armazenar, comparar e transmitir sempre em UTC (ISO 8601 com Z)
10. **Todo código em TypeScript** — sem JavaScript puro
11. **Nomenclatura de código em inglês** — variáveis, funções, classes
12. **Comentários em português** — é um projeto nacional, facilita manutenção
13. **Paginação obrigatória** em todos os endpoints de listagem — nunca retornar arrays sem limite
14. **Padrão de resposta único** — sempre `{ data: ... }` para sucesso, `{ error: ... }` para erro

---

## OBSERVAÇÕES FINAIS

- Este é um projeto **solo** — priorizar clareza e manutenibilidade
- A integração com **Sintegra** (busca por CNPJ) é Fase 2 — deixar apenas um `// TODO: Sintegra` no formulário de cliente
- A **geração de PDF** é Fase 4 — deixar o botão "Gerar PDF" na tela de pedido sem funcionalidade ainda
- O **módulo Financeiro** completo é Fase 5 — criar apenas estrutura de pastas e entities agora

Pode começar. Priorize funcionalidade e correção sobre perfeição estética inicial.
