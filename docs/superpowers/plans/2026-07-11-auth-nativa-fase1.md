# Auth Nativa (FASE 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a autenticação federada ZonaDevAuth por autenticação nativa (email+senha) do Renowa, com refresh tokens rotativos e detecção de reuso, reusando o RBAC existente.

**Architecture:** `usuarios.uuid` vira o `sub` da identidade. `usuarios` ganha `senha_hash`/lockout e passa a ser o store de credenciais. Access token JWT HS256 (15min, cookie `renowa_at`) + refresh token opaco 64B (7d, cookie `renowa_rt`, hash SHA-256 no DB, rotação com detecção de reuso). `LocalUser`/`TenantRole`/`Permission`/`PermissionGuard`/`AutoProvisionGuard` são mantidos — só troca a origem do `sub`. OIDC/ZonaDev/JWKS/AuthApiService removidos.

**Tech Stack:** NestJS 10, TypeORM, PostgreSQL, `argon2`, `jsonwebtoken`, `@nestjs/throttler`, `nestjs-cls`; React + Vite + React Hook Form + Zod; Jest + @nestjs/testing + supertest.

## Global Constraints

- Multi-tenant: `tenant_id UUID NOT NULL` em TODAS as tabelas (inclui `refresh_tokens`). `tenant_id` vem do JWT/DB, NUNCA do cliente.
- Shape `RequestUser` (`sub, tenantId, tenantSubdomain, roles, plan, tokenVersion, jti, email?, defaultRole?`) preservado — não quebrar `TenantContextInterceptor`/CLS.
- Senha NUNCA logada nem retornada. Hash sempre argon2id via `argon2.hash`/`argon2.verify`.
- Cookies de auth: `HttpOnly; Secure; SameSite=Strict`. `renowa_at` `Path=/`; `renowa_rt` `Path=/api/auth`. Sem atributo `Domain`.
- Migrations = SQL puro em `backend/src/database/migrations/NNN_*.sql`, idempotente (`IF NOT EXISTS`).
- `VITE_API_URL` já inclui `/api` — não repetir nos paths do frontend.
- Convenção: código/identificadores em inglês; comentários só onde a decisão é não-óbvia.
- Access token secret: `RENOWA_AT_SECRET`. Mobile 30d continua com `RENOWA_JWT_SECRET`.
- Commits frequentes, um por task no mínimo. Sem `--no-verify`.

---

### Task 0: Dependências + infraestrutura de testes (Jest)

Não há runner de testes instalado (`test: jest` sem `jest`). Sem isto, nenhuma task TDD roda.

**Files:**
- Modify: `backend/package.json`
- Create: `backend/jest.config.js`
- Create: `backend/src/health/health.smoke.spec.ts` (smoke — removível depois)

- [ ] **Step 1: Instalar deps**

Run:
```bash
cd backend && npm install argon2 && npm install -D jest@29 ts-jest@29 @types/jest@29 supertest @types/supertest
```
> **Pin obrigatório em v29:** `jest@30` + `ts-jest@29` gera skew de runtime (`TypeError: this._moduleMocker.clearMocksOnScope is not a function`). ts-jest 29 casa com jest 29. Manter todos `jest*` em 29.x.
Expected: instala sem erro; `argon2` em `dependencies`, os demais em `devDependencies`. (`@nestjs/testing` já está em devDependencies.) `argon2` é módulo nativo — em Windows exige build tools; se `node-gyp` falhar, usa prebuild automático.

- [ ] **Step 2: Config do Jest**

Create `backend/jest.config.js`:
```js
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['**/*.ts'],
  testEnvironment: 'node',
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/$1' },
};
```

- [ ] **Step 3: Smoke test (verifica que o runner roda)**

Create `backend/src/health/health.smoke.spec.ts`:
```ts
describe('jest smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Rodar**

Run: `cd backend && npx jest health.smoke`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/jest.config.js backend/src/health/health.smoke.spec.ts
git commit -m "chore(backend): add argon2 + jest test infra"
```

---

### Task 1: Schema — colunas de senha em `usuarios`, `UNIQUE(email)`, tabela `refresh_tokens`

**Files:**
- Modify: `backend/src/users/entities/user.entity.ts`
- Create: `backend/src/auth/entities/refresh-token.entity.ts`
- Create: `backend/src/database/migrations/005_native_auth.sql`

**Interfaces:**
- Produces: `User.senha_hash: string | null`, `User.failed_login_attempts: number`, `User.locked_until: Date | null`. Entity `RefreshToken` com colunas abaixo.

- [ ] **Step 1: Migration SQL**

Create `backend/src/database/migrations/005_native_auth.sql`:
```sql
-- =============================================================================
-- Renowa — Migration 005: autenticação nativa (credenciais + refresh tokens)
-- =============================================================================

-- Credenciais e defesas de login em usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS senha_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL;

-- Email global único (decisão: 1 tenant de fato). Remove índice não-único antigo.
DROP INDEX IF EXISTS "IDX_usuarios_tenant_id_email";
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (email) WHERE deleted_at IS NULL;

-- Refresh tokens rotativos (multi-tenant: tenant_id NOT NULL)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           BIGSERIAL PRIMARY KEY,
  uuid         UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  token_hash   TEXT NOT NULL,
  user_id      BIGINT NOT NULL REFERENCES usuarios(id),
  family_id    UUID NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ NULL,
  replaced_by_id BIGINT NULL REFERENCES refresh_tokens(id),
  user_agent   TEXT NULL,
  ip           INET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_refresh_tokens_uuid ON refresh_tokens (uuid);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_id ON refresh_tokens (tenant_id);
```

> Nota: confirmar o nome real do índice antigo com `\d usuarios` antes de rodar em prod; `DROP INDEX IF EXISTS` é no-op se o nome divergir. Em dev o `synchronize:true` recria a partir das entities.

- [ ] **Step 2: Colunas na entity `User`**

Edit `backend/src/users/entities/user.entity.ts` — adicionar após `last_login_at`:
```ts
  @Column({ name: 'senha_hash', type: 'text', nullable: true })
  senha_hash: string | null;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failed_login_attempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  locked_until: Date | null;
```
E trocar o índice de email para único global: substituir `@Index(['tenant_id', 'email'])` por `@Index(['email'], { unique: true })`.

- [ ] **Step 3: Entity `RefreshToken`**

Create `backend/src/auth/entities/refresh-token.entity.ts`:
```ts
import { BaseEntity } from '../../common/entities/base.entity';
import { Column, Entity, Index } from 'typeorm';

@Entity('refresh_tokens')
@Index(['token_hash'])
@Index(['user_id'])
@Index(['family_id'])
export class RefreshToken extends BaseEntity {
  @Column({ name: 'token_hash', type: 'text' })
  token_hash: string;

  @Column({ name: 'user_id', type: 'bigint' })
  user_id: number;

  @Column({ name: 'family_id', type: 'uuid' })
  family_id: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expires_at: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @Column({ name: 'replaced_by_id', type: 'bigint', nullable: true })
  replaced_by_id: number | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  user_agent: string | null;

  @Column({ name: 'ip', type: 'inet', nullable: true })
  ip: string | null;
}
```
> Confirmar que `base.entity.ts` já traz `id`, `uuid`, `tenant_id`, `created_at`, `updated_at`, `deleted_at`. Se `BaseEntity` não declara `tenant_id`, adicioná-lo aqui como coluna `uuid`.

- [ ] **Step 4: Build**

Run: `cd backend && npm run build`
Expected: compila sem erro de tipo.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/entities/user.entity.ts backend/src/auth/entities/refresh-token.entity.ts backend/src/database/migrations/005_native_auth.sql
git commit -m "feat(auth): schema de credenciais em usuarios + refresh_tokens"
```

---

### Task 2: `PasswordService` (argon2id)

**Files:**
- Create: `backend/src/auth/password.service.ts`
- Test: `backend/src/auth/password.service.spec.ts`

**Interfaces:**
- Produces: `PasswordService.hash(plain: string): Promise<string>`, `PasswordService.verify(hash: string, plain: string): Promise<boolean>`, `PasswordService.dummyVerify(plain: string): Promise<void>` (timing anti-enumeração).

- [ ] **Step 1: Failing test**

Create `backend/src/auth/password.service.spec.ts`:
```ts
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await svc.hash('s3nha-forte');
    expect(hash).not.toContain('s3nha-forte');
    expect(await svc.verify(hash, 's3nha-forte')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await svc.hash('s3nha-forte');
    expect(await svc.verify(hash, 'errada')).toBe(false);
  });

  it('dummyVerify never throws (timing leveler)', async () => {
    await expect(svc.dummyVerify('qualquer')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest password.service`
Expected: FAIL ("Cannot find module './password.service'").

- [ ] **Step 3: Implement**

Create `backend/src/auth/password.service.ts`:
> **Correção de segurança vs. rascunho:** um `DUMMY_HASH` constante *malformado* faz `argon2.verify` lançar no parse **antes** do KDF → tempo ~0 → anula a defesa anti-enumeração. O dummy tem de ser um hash argon2id **válido**. Solução: computar um hash real uma vez, sob demanda (lazy), e verificar contra ele. (Confirmado: verify real ~112ms; malformado seria <1ms.)
```ts
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private dummyHashPromise: Promise<string> | null = null;

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  async dummyVerify(plain: string): Promise<void> {
    const dummy = await this.getDummyHash();
    await this.verify(dummy, plain);
  }

  private getDummyHash(): Promise<string> {
    if (!this.dummyHashPromise) {
      this.dummyHashPromise = this.hash('dummy-password-for-timing-leveling');
    }
    return this.dummyHashPromise;
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest password.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/password.service.ts backend/src/auth/password.service.spec.ts
git commit -m "feat(auth): PasswordService argon2id + timing leveler"
```

---

### Task 3: `AccessTokenService` (JWT HS256)

**Files:**
- Create: `backend/src/auth/access-token.service.ts`
- Test: `backend/src/auth/access-token.service.spec.ts`

**Interfaces:**
- Consumes: `ConfigService.getOrThrow('RENOWA_AT_SECRET')`.
- Produces:
  - `AccessTokenService.sign(input: { sub: string; tenantId: string; roles: string[]; email: string }): string`
  - `AccessTokenService.verify(token: string): RequestUser` (lança em inválido/expirado).

- [ ] **Step 1: Failing test**

Create `backend/src/auth/access-token.service.spec.ts`:
```ts
import { ConfigService } from '@nestjs/config';
import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  const config = { getOrThrow: () => 'test-at-secret' } as unknown as ConfigService;
  const svc = new AccessTokenService(config);

  it('signs and verifies, preserving RequestUser shape', () => {
    const token = svc.sign({ sub: 'u-1', tenantId: 't-1', roles: ['admin'], email: 'a@b.c' });
    const user = svc.verify(token);
    expect(user.sub).toBe('u-1');
    expect(user.tenantId).toBe('t-1');
    expect(user.roles).toEqual(['admin']);
    expect(user.email).toBe('a@b.c');
    expect(typeof user.jti).toBe('string');
  });

  it('throws on tampered token', () => {
    expect(() => svc.verify('not.a.jwt')).toThrow();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest access-token.service`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

Create `backend/src/auth/access-token.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { RequestUser } from '../common/types/jwt-payload.type';

interface AccessTokenClaims {
  sub: string;
  tenantId: string;
  roles: string[];
  email: string;
  jti: string;
  type: 'access';
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class AccessTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('RENOWA_AT_SECRET');
  }

  sign(input: { sub: string; tenantId: string; roles: string[]; email: string }): string {
    const claims: AccessTokenClaims = {
      sub: input.sub,
      tenantId: input.tenantId,
      roles: input.roles,
      email: input.email,
      jti: randomUUID(),
      type: 'access',
    };
    return jwt.sign(claims, this.secret, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  }

  verify(token: string): RequestUser {
    const claims = jwt.verify(token, this.secret) as AccessTokenClaims;
    if (claims.type !== 'access') {
      throw new Error('invalid token type');
    }
    return {
      sub: claims.sub,
      tenantId: claims.tenantId,
      tenantSubdomain: '',
      roles: claims.roles,
      plan: '',
      tokenVersion: 0,
      jti: claims.jti,
      email: claims.email,
    };
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest access-token.service`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/access-token.service.ts backend/src/auth/access-token.service.spec.ts
git commit -m "feat(auth): AccessTokenService HS256 (RENOWA_AT_SECRET)"
```

---

### Task 4: `RefreshTokenService` (rotação + detecção de reuso)

**Files:**
- Create: `backend/src/auth/refresh-token.service.ts`
- Test: `backend/src/auth/refresh-token.service.spec.ts`

**Interfaces:**
- Consumes: `Repository<RefreshToken>` (TypeORM).
- Produces:
  - `issue(input: { userId: number; tenantId: string; familyId?: string; userAgent?: string; ip?: string }): Promise<{ token: string }>` — cria token novo (família nova se `familyId` ausente).
  - `rotate(rawToken: string, meta: { userAgent?: string; ip?: string }): Promise<{ token: string; userId: number; tenantId: string }>` — valida, detecta reuso (revoga família + lança `UnauthorizedException`), rotaciona.
  - `revokeFamilyByRawToken(rawToken: string): Promise<void>` — logout.
  - `revokeAllForUser(userId: number): Promise<void>` — change-password.
- Static helper: `RefreshTokenService.hashToken(raw: string): string` (SHA-256 hex).

- [ ] **Step 1: Failing test**

Create `backend/src/auth/refresh-token.service.spec.ts`:
```ts
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import { RefreshToken } from './entities/refresh-token.entity';

/** Repo TypeORM em memória mínimo para o serviço. */
function makeRepo() {
  const rows: RefreshToken[] = [];
  let seq = 1;
  return {
    rows,
    create: (data: Partial<RefreshToken>) => ({ ...data }) as RefreshToken,
    save: async (r: RefreshToken) => {
      if (!r.id) { r.id = seq++; rows.push(r); }
      return r;
    },
    findOne: async ({ where }: any) =>
      rows.find((r) => r.token_hash === where.token_hash) ?? null,
    update: async (criteria: any, patch: any) => {
      rows
        .filter((r) => (criteria.family_id ? r.family_id === criteria.family_id : r.id === criteria.id) &&
          (criteria.user_id ? r.user_id === criteria.user_id : true))
        .forEach((r) => Object.assign(r, patch));
    },
  };
}

describe('RefreshTokenService', () => {
  it('issues and rotates a token', async () => {
    const repo = makeRepo();
    const svc = new RefreshTokenService(repo as any);
    const { token } = await svc.issue({ userId: 1, tenantId: 't-1' });
    const rotated = await svc.rotate(token, {});
    expect(rotated.userId).toBe(1);
    expect(rotated.token).not.toBe(token);
    // token antigo agora está revogado
    const old = repo.rows.find((r) => r.token_hash === RefreshTokenService.hashToken(token))!;
    expect(old.revoked_at).toBeTruthy();
  });

  it('detects reuse and revokes the whole family', async () => {
    const repo = makeRepo();
    const svc = new RefreshTokenService(repo as any);
    const { token } = await svc.issue({ userId: 1, tenantId: 't-1' });
    await svc.rotate(token, {});            // primeira rotação: token vira revogado
    await expect(svc.rotate(token, {})).rejects.toBeInstanceOf(UnauthorizedException); // reuso
    // toda a família revogada
    expect(repo.rows.every((r) => r.revoked_at)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest refresh-token.service`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

Create `backend/src/auth/refresh-token.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity';

export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  async issue(input: {
    userId: number;
    tenantId: string;
    familyId?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ token: string }> {
    const raw = randomBytes(64).toString('base64url');
    const row = this.repo.create({
      tenant_id: input.tenantId,
      token_hash: RefreshTokenService.hashToken(raw),
      user_id: input.userId,
      family_id: input.familyId ?? randomUUID(),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked_at: null,
      replaced_by_id: null,
      user_agent: input.userAgent ?? null,
      ip: input.ip ?? null,
    });
    await this.repo.save(row);
    return { token: raw };
  }

  async rotate(
    rawToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<{ token: string; userId: number; tenantId: string }> {
    const current = await this.repo.findOne({
      where: { token_hash: RefreshTokenService.hashToken(rawToken) },
    });

    if (!current) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Reuso de token já revogado = indício de roubo → revoga a família toda.
    if (current.revoked_at) {
      await this.repo.update({ family_id: current.family_id }, { revoked_at: new Date() });
      throw new UnauthorizedException('Refresh token reutilizado');
    }

    if (current.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    const next = await this.issue({
      userId: current.user_id,
      tenantId: current.tenant_id,
      familyId: current.family_id,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });

    const replacement = await this.repo.findOne({
      where: { token_hash: RefreshTokenService.hashToken(next.token) },
    });
    current.revoked_at = new Date();
    current.replaced_by_id = replacement?.id ?? null;
    await this.repo.save(current);

    return { token: next.token, userId: current.user_id, tenantId: current.tenant_id };
  }

  async revokeFamilyByRawToken(rawToken: string): Promise<void> {
    const current = await this.repo.findOne({
      where: { token_hash: RefreshTokenService.hashToken(rawToken) },
    });
    if (current) {
      await this.repo.update({ family_id: current.family_id }, { revoked_at: new Date() });
    }
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.repo.update({ user_id: userId }, { revoked_at: new Date() });
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest refresh-token.service`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/refresh-token.service.ts backend/src/auth/refresh-token.service.spec.ts
git commit -m "feat(auth): RefreshTokenService com rotação e detecção de reuso"
```

---

### Task 5: `NativeAuthService` — login, refresh, logout, change-password, lockout

**Files:**
- Create: `backend/src/auth/native-auth.service.ts`
- Test: `backend/src/auth/native-auth.service.spec.ts`

**Interfaces:**
- Consumes: `Repository<User>`, `PasswordService`, `AccessTokenService`, `RefreshTokenService`.
- Produces:
  - `login(email, senha, meta): Promise<{ accessToken: string; refreshToken: string }>`
  - `refresh(rawRefresh, meta): Promise<{ accessToken: string; refreshToken: string }>`
  - `logout(rawRefresh): Promise<void>`
  - `changePassword(userSub: string, tenantId: string, current: string, next: string): Promise<void>`
- Comportamento: 401 genérico (`UnauthorizedException('Credenciais inválidas')`) para email inexistente / senha errada / conta travada. Lockout: 5+ falhas → `locked_until` com backoff `{5:1,6:5,7:15,>=8:60}` minutos. Sucesso zera `failed_login_attempts` e `locked_until`, seta `last_login_at`.

- [ ] **Step 1: Failing test**

Create `backend/src/auth/native-auth.service.spec.ts`:
```ts
import { UnauthorizedException } from '@nestjs/common';
import { NativeAuthService } from './native-auth.service';
import { PasswordService } from './password.service';
import { User } from '../users/entities/user.entity';

function makeUserRepo(user: Partial<User> | null) {
  const state = user ? ({ ...user } as User) : null;
  return {
    state,
    findOne: async () => state,
    update: async (_id: number, patch: Partial<User>) => {
      if (state) Object.assign(state, patch);
    },
  };
}

describe('NativeAuthService.login', () => {
  const pwd = new PasswordService();
  const access = { sign: () => 'access.jwt' } as any;
  const refresh = { issue: async () => ({ token: 'refresh.raw' }) } as any;

  it('returns tokens for valid credentials and resets counters', async () => {
    const hash = await pwd.hash('correta');
    const repo = makeUserRepo({
      id: 1, uuid: 'u-1', tenant_id: 't-1', email: 'a@b.c', roles: ['admin'],
      is_active: true, senha_hash: hash, failed_login_attempts: 2, locked_until: null,
    });
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    const out = await svc.login('a@b.c', 'correta', {});
    expect(out.accessToken).toBe('access.jwt');
    expect(out.refreshToken).toBe('refresh.raw');
    expect(repo.state!.failed_login_attempts).toBe(0);
  });

  it('rejects wrong password with generic 401 and increments counter', async () => {
    const hash = await pwd.hash('correta');
    const repo = makeUserRepo({
      id: 1, uuid: 'u-1', tenant_id: 't-1', email: 'a@b.c', roles: ['admin'],
      is_active: true, senha_hash: hash, failed_login_attempts: 0, locked_until: null,
    });
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    await expect(svc.login('a@b.c', 'errada', {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.state!.failed_login_attempts).toBe(1);
  });

  it('rejects unknown email with generic 401', async () => {
    const repo = makeUserRepo(null);
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    await expect(svc.login('nope@b.c', 'x', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when account is locked', async () => {
    const hash = await pwd.hash('correta');
    const repo = makeUserRepo({
      id: 1, uuid: 'u-1', tenant_id: 't-1', email: 'a@b.c', roles: ['admin'],
      is_active: true, senha_hash: hash, failed_login_attempts: 5,
      locked_until: new Date(Date.now() + 60_000),
    });
    const svc = new NativeAuthService(repo as any, pwd, access, refresh);
    await expect(svc.login('a@b.c', 'correta', {})).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest native-auth.service`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

Create `backend/src/auth/native-auth.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { PasswordService } from './password.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';

interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

const LOCKOUT_BACKOFF_MINUTES: Record<number, number> = { 5: 1, 6: 5, 7: 15 };
const MAX_BACKOFF_MINUTES = 60;

@Injectable()
export class NativeAuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(email: string, senha: string, meta: RequestMeta) {
    const user = await this.userRepo.findOne({
      where: { email, is_active: true, deleted_at: IsNull() },
    });

    // Anti-enumeração: mesmo custo/tempo aproximado quando o usuário não existe.
    if (!user || !user.senha_hash) {
      await this.passwords.dummyVerify(senha);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.locked_until && user.locked_until.getTime() > Date.now()) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await this.passwords.verify(user.senha_hash, senha);
    if (!ok) {
      await this.registerFailure(user);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.userRepo.update(user.id, {
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date(),
    });

    return this.issuePair(user.uuid, user.tenant_id, user.roles, user.email, user.id, meta);
  }

  async refresh(rawRefresh: string, meta: RequestMeta) {
    const rotated = await this.refreshTokens.rotate(rawRefresh, meta);
    const user = await this.userRepo.findOne({
      where: { id: rotated.userId, is_active: true, deleted_at: IsNull() },
    });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const accessToken = this.accessTokens.sign({
      sub: user.uuid,
      tenantId: user.tenant_id,
      roles: user.roles,
      email: user.email,
    });
    return { accessToken, refreshToken: rotated.token };
  }

  async logout(rawRefresh: string): Promise<void> {
    await this.refreshTokens.revokeFamilyByRawToken(rawRefresh);
  }

  async changePassword(
    userSub: string,
    tenantId: string,
    current: string,
    next: string,
  ): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { uuid: userSub, tenant_id: tenantId, deleted_at: IsNull() },
    });
    if (!user || !user.senha_hash || !(await this.passwords.verify(user.senha_hash, current))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }
    const hash = await this.passwords.hash(next);
    await this.userRepo.update(user.id, { senha_hash: hash });
    await this.refreshTokens.revokeAllForUser(user.id);
  }

  private async issuePair(
    sub: string,
    tenantId: string,
    roles: string[],
    email: string,
    userId: number,
    meta: RequestMeta,
  ) {
    const accessToken = this.accessTokens.sign({ sub, tenantId, roles, email });
    const { token: refreshToken } = await this.refreshTokens.issue({
      userId,
      tenantId,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return { accessToken, refreshToken };
  }

  private async registerFailure(user: User): Promise<void> {
    const attempts = user.failed_login_attempts + 1;
    const minutes =
      attempts >= 8 ? MAX_BACKOFF_MINUTES : LOCKOUT_BACKOFF_MINUTES[attempts];
    const patch: Partial<User> = { failed_login_attempts: attempts };
    if (minutes) {
      patch.locked_until = new Date(Date.now() + minutes * 60_000);
    }
    await this.userRepo.update(user.id, patch);
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest native-auth.service`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/native-auth.service.ts backend/src/auth/native-auth.service.spec.ts
git commit -m "feat(auth): NativeAuthService (login/refresh/logout/change-password + lockout)"
```

---

### Task 6: DTOs + `AuthController` nativo (rotas + cookies)

**Files:**
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/dto/change-password.dto.ts`
- Modify: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/cookie.util.ts`
- Test: `backend/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `NativeAuthService` (Task 5).
- Produces: rotas `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/change-password`; helper `setAuthCookies(res, { accessToken, refreshToken })` e `clearAuthCookies(res)`.

- [ ] **Step 1: DTOs**

Create `backend/src/auth/dto/login.dto.ts`:
```ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  senha: string;
}
```

Create `backend/src/auth/dto/change-password.dto.ts`:
```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  current_password: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  new_password: string;
}
```

- [ ] **Step 2: Cookie helper**

Create `backend/src/auth/cookie.util.ts`:
```ts
import { Response } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS } from './access-token.service';
import { REFRESH_TOKEN_TTL_MS } from './refresh-token.service';

const AT_COOKIE = 'renowa_at';
const RT_COOKIE = 'renowa_rt';
const RT_PATH = '/api/auth';

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): void {
  res.cookie(AT_COOKIE, tokens.accessToken, {
    httpOnly: true, secure: true, sameSite: 'strict', path: '/',
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(RT_COOKIE, tokens.refreshToken, {
    httpOnly: true, secure: true, sameSite: 'strict', path: RT_PATH,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(AT_COOKIE, { path: '/' });
  res.clearCookie(RT_COOKIE, { path: RT_PATH });
}

export { AT_COOKIE, RT_COOKIE };
```

- [ ] **Step 3: Reescrever `auth.controller.ts`**

Replace o conteúdo de `backend/src/auth/auth.controller.ts`:
```ts
import {
  Controller, Post, Get, Delete, Param, Body, Req, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { NativeAuthService } from './native-auth.service';
import { MobileSessionService } from './mobile-session.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { setAuthCookies, clearAuthCookies, RT_COOKIE } from './cookie.util';

function reqMeta(req: Request) {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: NativeAuthService,
    private readonly mobileSessions: MobileSessionService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto.email, dto.senha, reqMeta(req));
    setAuthCookies(res, tokens);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as any).cookies?.[RT_COOKIE] as string | undefined;
    const tokens = await this.auth.refresh(raw ?? '', reqMeta(req));
    setAuthCookies(res, tokens);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req as any).cookies?.[RT_COOKIE] as string | undefined;
    if (raw) await this.auth.logout(raw);
    clearAuthCookies(res);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.sub, user.tenantId, dto.current_password, dto.new_password);
  }

  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    if (!user) return {};
    const { sub, email, roles, tenantId } = user;
    return { sub, email, roles, tenantId };
  }

  // Preservar endpoint existente de revogar sessão mobile (regressão se removido).
  @Delete('mobile-session/:uuid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @Param('uuid') sessionUuid: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.mobileSessions.revokeSession(sessionUuid, user.tenantId);
  }
}
```
> `mobile-session` (criação) sai deste controller — passa a viver no `AuthControllerImpl` (Task 8). Mas `DELETE /mobile-session/:uuid` (revogação) **fica aqui** — injetar `MobileSessionService` como `mobileSessions` no construtor junto de `NativeAuthService`, e importar `Delete`, `Param`. `AuthController` continua exportado com `MobileSessionService` disponível via `AuthModule`.
> **R2 — `/me` encolheu:** removidos `plan`/`defaultRole` (não existem no auth nativo). Conferir que `loadUser` do frontend (Task 13) não lê esses campos antes de finalizar.

- [ ] **Step 4: Test do controller (Nest testing)**

Create `backend/src/auth/auth.controller.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { NativeAuthService } from './native-auth.service';
import { MobileSessionService } from './mobile-session.service';

describe('AuthController', () => {
  let controller: AuthController;
  const auth = {
    login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    logout: jest.fn(async () => undefined),
  };
  const mobileSessions = { revokeSession: jest.fn(async () => undefined) };

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: NativeAuthService, useValue: auth },
        { provide: MobileSessionService, useValue: mobileSessions },
      ],
    }).compile();
    controller = mod.get(AuthController);
  });

  it('login sets both auth cookies', async () => {
    const cookies: Record<string, string> = {};
    const res = { cookie: (name: string, val: string) => { cookies[name] = val; }, clearCookie: jest.fn() } as any;
    const req = { headers: {}, ip: '127.0.0.1' } as any;
    await controller.login({ email: 'a@b.c', senha: 'x' } as any, req, res);
    expect(cookies['renowa_at']).toBe('a');
    expect(cookies['renowa_rt']).toBe('r');
  });
});
```

- [ ] **Step 5: Run + commit**

Run: `cd backend && npx jest auth.controller`
Expected: PASS (1 test).
```bash
git add backend/src/auth/dto/login.dto.ts backend/src/auth/dto/change-password.dto.ts backend/src/auth/cookie.util.ts backend/src/auth/auth.controller.ts backend/src/auth/auth.controller.spec.ts
git commit -m "feat(auth): rotas nativas login/refresh/logout/change-password + cookies"
```

---

### Task 7: `JwtAuthGuard` — validar access token nativo (remove JWKS)

**Files:**
- Modify: `backend/src/common/guards/jwt-auth.guard.ts`
- Test: `backend/src/common/guards/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consumes: `AccessTokenService.verify` (Task 3), `MobileSessionService.validateSessionToken` (fallback mobile).
- Cookie de access passa a ser `renowa_at` (constante `AT_COOKIE`).

- [ ] **Step 1: Failing test**

Create `backend/src/common/guards/jwt-auth.guard.spec.ts`:
```ts
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function ctxFor(req: any) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => null,
    getClass: () => null,
  } as any;
}

describe('JwtAuthGuard', () => {
  const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
  const access = { verify: (t: string) => {
    if (t === 'good') return { sub: 'u-1', tenantId: 't-1', roles: ['admin'] };
    throw new Error('bad');
  } } as any;
  const mobile = { validateSessionToken: async () => { throw new Error('no'); } } as any;
  const guard = new JwtAuthGuard(reflector, access, mobile);

  it('accepts a valid native access cookie', async () => {
    const req: any = { cookies: { renowa_at: 'good' }, headers: {} };
    await expect(guard.canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user.sub).toBe('u-1');
  });

  it('rejects when no token present', async () => {
    const req: any = { cookies: {}, headers: {} };
    await expect(guard.canActivate(ctxFor(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd backend && npx jest jwt-auth.guard`
Expected: FAIL (guard ainda depende de `JwksStrategy`; construtor não bate).

- [ ] **Step 3: Reescrever o guard**

Replace `backend/src/common/guards/jwt-auth.guard.ts`:
```ts
import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AccessTokenService } from '../../auth/access-token.service';
import { MobileSessionService } from '../../auth/mobile-session.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RequestUser } from '../types/jwt-payload.type';

const AT_COOKIE = 'renowa_at';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokenService,
    private readonly mobileSessionService: MobileSessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const cookieToken = (req as any).cookies?.[AT_COOKIE] as string | undefined;

    // Web: access token nativo HS256 no cookie renowa_at
    if (cookieToken) {
      try {
        req.user = this.accessTokens.verify(cookieToken);
        return true;
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }

    // Mobile: HS256 de 30 dias no header Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      try {
        req.user = await this.mobileSessionService.validateSessionToken(authHeader.slice(7));
        return true;
      } catch {
        throw new UnauthorizedException('Token inválido ou expirado');
      }
    }

    throw new UnauthorizedException('Token não fornecido');
  }
}
```

- [ ] **Step 4: Run to pass**

Run: `cd backend && npx jest jwt-auth.guard`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/guards/jwt-auth.guard.ts backend/src/common/guards/jwt-auth.guard.spec.ts
git commit -m "feat(auth): JwtAuthGuard valida access token nativo (cookie renowa_at)"
```

---

### Task 8: `mobile-session` nativo (credenciais → HS256 30d)

**Files:**
- Modify: `backend/src/auth/mobile-session.service.ts`
- Modify: `backend/src/auth/auth.service.ts` (AuthControllerImpl)
- Modify: `backend/src/auth/dto/mobile-session.dto.ts`

**Interfaces:**
- Produces: `MobileSessionService.createSessionFromCredentials(email, senha, deviceInfo?): Promise<MobileSessionResponseDto>`; rota `POST /api/auth/mobile-session` recebe `{ email, senha, device_info? }`.

- [ ] **Step 1: DTO de credenciais**

Edit `backend/src/auth/dto/mobile-session.dto.ts` — adicionar (ou ajustar) `CreateMobileSessionDto`:
```ts
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMobileSessionDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(200)
  senha: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_info?: string;
}
```
> Manter `MobileSessionResponseDto` como está.

- [ ] **Step 2: `createSessionFromCredentials` no service**

Edit `backend/src/auth/mobile-session.service.ts`:
- Injetar `PasswordService` e `Repository<User>` no construtor.
- Adicionar método:
```ts
async createSessionFromCredentials(
  email: string,
  senha: string,
  deviceInfo?: string,
): Promise<{ token: string; user: { uuid: string; nome: string; roles: string[]; tenantId: string } }> {
  const user = await this.userRepo.findOne({
    where: { email, is_active: true, deleted_at: IsNull() },
  });
  if (!user || !user.senha_hash) {
    await this.passwords.dummyVerify(senha);
    throw new UnauthorizedException('Credenciais inválidas');
  }
  if (!(await this.passwords.verify(user.senha_hash, senha))) {
    throw new UnauthorizedException('Credenciais inválidas');
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const session = await this.sessionRepo.save(this.sessionRepo.create({
    tenant_id: user.tenant_id,
    user_uuid: user.uuid,
    token_version: 1,
    device_info: deviceInfo ?? null,
    expires_at: expiresAt,
    last_seen_at: new Date(),
    is_active: true,
  }));

  const token = jwt.sign(
    { sub: user.uuid, tenantId: user.tenant_id, roles: user.roles, plan: '',
      tokenVersion: session.token_version, sessionUuid: session.uuid, type: 'mobile' },
    this.secret, { expiresIn: '30d' },
  );

  return { token, user: { uuid: user.uuid, nome: user.nome, roles: user.roles, tenantId: user.tenant_id } };
}
```
- Remover o antigo `createSession(jwsPayload, ...)` e a checagem de `plan === 'SUSPENDED'` (não há plano nativo). Adicionar imports `IsNull` (typeorm), `User`, `PasswordService`. `validateSessionToken` fica igual.

- [ ] **Step 3: `AuthControllerImpl` usa credenciais**

Edit `backend/src/auth/auth.service.ts`:
- `AuthService`: remover `jwksStrategy`; remover `createMobileSessionFromRequest`; injetar `MobileSessionService`.
- `AuthControllerImpl.createMobileSession`: receber `@Body() dto: CreateMobileSessionDto` e chamar `createSessionFromCredentials`:
```ts
@Public()
@Post('mobile-session')
@HttpCode(HttpStatus.CREATED)
@Throttle({ default: { ttl: 60_000, limit: 10 } })
async createMobileSession(@Body() dto: CreateMobileSessionDto): Promise<{ data: MobileSessionResponseDto }> {
  const result = await this.mobileSessions.createSessionFromCredentials(dto.email, dto.senha, dto.device_info);
  return { data: result };
}
```

- [ ] **Step 4: Build**

Run: `cd backend && npm run build`
Expected: compila (após o AuthModule da Task 9 prover os deps; se ainda faltar wiring, seguir p/ Task 9 antes do build final).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/mobile-session.service.ts backend/src/auth/auth.service.ts backend/src/auth/dto/mobile-session.dto.ts
git commit -m "feat(auth): mobile-session emite HS256 a partir de credenciais nativas"
```

---

### Task 9: `UsersService.createTenantUser` nativo + DTOs + `@RequirePermission` + wiring do `AuthModule`

**Files:**
- Modify: `backend/src/users/dto/create-user.dto.ts`
- Modify: `backend/src/users/dto/update-user.dto.ts`
- Modify: `backend/src/users/users.service.ts`
- Modify: `backend/src/users/users.controller.ts`
- Modify: `backend/src/users/users.module.ts`
- Modify: `backend/src/auth/auth.module.ts`
- Test: `backend/src/users/users.service.native.spec.ts`

**Interfaces:**
- Consumes: `PasswordService`, `DataSource` (transação), repositórios `User`, `LocalUser`, `TenantRole`.
- Produces: `createTenantUser` cria `usuarios` (com `senha_hash`) + `LocalUser`; `resetPassword` em `updateTenantUser` quando `dto.new_password` presente.

- [ ] **Step 1: DTOs**

Edit `backend/src/users/dto/create-user.dto.ts`:
```ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(255)
  nome: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  senha: string;

  @IsString()
  @MaxLength(100)
  role: string;
}
```

Edit `backend/src/users/dto/update-user.dto.ts` — adicionar reset opcional:
```ts
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(100)
  role?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsString() @MinLength(8) @MaxLength(200)
  new_password?: string;
}
```

- [ ] **Step 2: Reescrever `createTenantUser` + `updateTenantUser` reset**

Edit `backend/src/users/users.service.ts`:
- Remover import/uso de `AuthApiService`; injetar `PasswordService` e `DataSource`.
- Substituir `createTenantUser`:
```ts
async createTenantUser(tenantId: string, dto: CreateUserDto) {
  const roleName = this.normalizeRoleName(dto.role);
  const senha_hash = await this.passwords.hash(dto.senha);

  return this.dataSource.transaction(async (manager) => {
    const emailTaken = await manager.getRepository(User).findOne({ where: { email: dto.email } });
    if (emailTaken) throw new BadRequestException('Email já cadastrado');

    const userUuid = randomUUID();
    const savedUser = await manager.getRepository(User).save(
      manager.getRepository(User).create({
        uuid: userUuid, tenant_id: tenantId, email: dto.email, nome: dto.nome,
        senha_hash, roles: [roleName], is_active: true,
      }),
    );

    const role = await this.ensureTenantRoleWith(manager, tenantId, roleName);
    const localUser = await manager.getRepository(LocalUser).save(
      manager.getRepository(LocalUser).create({
        tenantId, authUserId: savedUser.uuid, email: dto.email, roleId: role.id, active: true,
      }),
    );

    return {
      id: localUser.uuid, authUserId: localUser.authUserId, email: localUser.email,
      role: role.name, tenantId, active: localUser.active,
    };
  });
}
```
- Adicionar helper transacional `ensureTenantRoleWith(manager, tenantId, roleName)` espelhando `ensureTenantRole` mas usando `manager.getRepository(TenantRole)`.
- Em `updateTenantUser`, após atualizar role/active, se `dto.new_password`: buscar `usuarios` por `email = existing.email` e `tenant_id`, gravar `senha_hash = await this.passwords.hash(dto.new_password)`.
- Imports novos: `randomUUID` de `crypto`, `DataSource` de `typeorm`, `PasswordService`.

- [ ] **Step 3: `@RequirePermission` no controller**

Edit `backend/src/users/users.controller.ts` — decorar as rotas de gestão:
```ts
import { RequirePermission } from '../common/decorators/require-permission.decorator';
// ...
@Get()   @RequirePermission('users.manage')  async list(...) { ... }
@Post()  @RequirePermission('users.manage')  async create(...) { ... }
@Patch(':id') @RequirePermission('users.manage') async update(...) { ... }
```
> `GET /users/me` NÃO recebe `@RequirePermission` (qualquer usuário autenticado lê o próprio contexto).

- [ ] **Step 4: Wiring dos módulos**

Edit `backend/src/users/users.module.ts`: remover `AuthApiService`/`AuthApiModule`; garantir `TypeOrmModule.forFeature([User, LocalUser, TenantRole, TenantRolePermission])` e `providers: [UsersService, PasswordService]` (ou importar `AuthModule` que exporta `PasswordService`). `DataSource` é injetável globalmente pelo TypeORM.

Edit `backend/src/auth/auth.module.ts`:
```ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileSession } from './entities/mobile-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { MobileSessionService } from './mobile-session.service';
import { AuthService, AuthControllerImpl } from './auth.service';
import { AuthController } from './auth.controller';
import { NativeAuthService } from './native-auth.service';
import { PasswordService } from './password.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MobileSession, RefreshToken, User]),
    forwardRef(() => UsersModule),
  ],
  controllers: [AuthControllerImpl, AuthController],
  providers: [
    MobileSessionService, AuthService, NativeAuthService,
    PasswordService, AccessTokenService, RefreshTokenService,
  ],
  exports: [MobileSessionService, AccessTokenService, PasswordService],
})
export class AuthModule {}
```
> `JwksStrategy` sai (Task 11). `JwtAuthGuard` (global no `app.module`) precisa de `AccessTokenService` + `MobileSessionService` — ambos exportados pelo `AuthModule`.

- [ ] **Step 5: Test + build + commit**

Create `backend/src/users/users.service.native.spec.ts` (transação mockada):
```ts
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';

describe('UsersService.createTenantUser (nativo)', () => {
  it('rejects duplicate email', async () => {
    const manager = {
      getRepository: () => ({
        findOne: async () => ({ id: 1 }), // email já existe
        create: (x: any) => x, save: async (x: any) => ({ ...x, id: 1, uuid: 'u' }),
      }),
    };
    const dataSource = { transaction: async (cb: any) => cb(manager) } as any;
    const svc = new UsersService(
      {} as any, {} as any, {} as any, {} as any, new PasswordService(), dataSource,
    );
    await expect(
      svc.createTenantUser('t-1', { email: 'a@b.c', nome: 'A', senha: 'senha1234', role: 'admin' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
```
> Ajustar a ordem dos parâmetros do construtor de `UsersService` ao que ficou após a edição.

Run: `cd backend && npx jest users.service.native && npm run build`
Expected: teste PASS; build compila.
```bash
git add backend/src/users backend/src/auth/auth.module.ts
git commit -m "feat(users): criação nativa de usuário (usuarios+LocalUser) + @RequirePermission"
```

---

### Task 10: Permissão `users.manage` (migration)

**Files:**
- Create: `backend/src/database/migrations/006_users_manage_permission.sql`

- [ ] **Step 1: Migration**

> **CONFIRMADO no schema real (`002_local_permissions.sql` + `common/entities/permission.entity.ts`):** tabela `permissions(id, slug UNIQUE, description TEXT NULL, module VARCHAR(50) NOT NULL, created_at, updated_at)`. Coluna `module` é **NOT NULL sem default** — o INSERT precisa fornecê-la.
```sql
-- Renowa — Migration 006: permissão de gestão de usuários
INSERT INTO permissions (slug, description, module)
VALUES ('users.manage', 'Gerenciar usuários do tenant', 'usuarios')
ON CONFLICT (slug) DO NOTHING;
```
> **Nota (sem runner de migration):** não há código que execute os `NNN_*.sql`. Em dev, `synchronize:true` cria schema a partir das entities mas **não faz seed** — este INSERT só entra rodando o SQL manualmente. Em prod (`synchronize:false`) todo o `005`/`006` é aplicado à mão. `PermissionGuard` faz bypass para role `admin`, então o slug só importa ao conceder a role não-admin.

- [ ] **Step 2: Commit**

```bash
git add backend/src/database/migrations/006_users_manage_permission.sql
git commit -m "feat(rbac): permissão users.manage"
```
> Role `admin` já faz bypass no `PermissionGuard`; o slug existe para conceder a roles não-admin no futuro.

---

### Task 11: Remover OIDC/ZonaDev/JWKS/AuthApiService + env

**Files:**
- Delete: `backend/src/oidc/` (controller, service, module)
- Delete: `backend/src/auth-api/` (service, module)
- Delete: `backend/src/auth/jwks.strategy.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/.env.example`
- Modify: `backend/src/auth/auth.service.ts` (remover import de `JwksStrategy` se restou)

- [ ] **Step 1: Remover módulos ZonaDev**

Run:
```bash
cd backend && rm -rf src/oidc src/auth-api src/auth/jwks.strategy.ts
```

- [ ] **Step 2: `app.module.ts`**

Edit `backend/src/app.module.ts`: remover `import { OidcModule }` e `OidcModule` do array `imports`. (Nenhum outro registro de `auth-api`/`oidc` global existe.)

- [ ] **Step 3: `.env.example`**

Edit `backend/.env.example`: remover `ZONADEV_JWKS_URL`, `ZONADEV_EXPECTED_ISS`, `ZONADEV_EXPECTED_AUD`, `AUTH_URL`, `AUTH_INTERNAL_SECRET`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`, `OIDC_LOGOUT_REDIRECT`, `AUTH_COOKIE_NAME`. Adicionar `RENOWA_AT_SECRET=troque-por-segredo-forte`.

- [ ] **Step 4: Build (varre referências órfãs)**

Run: `cd backend && npm run build`
Expected: compila. Se acusar import faltando (ex.: algum arquivo ainda importa `JwksStrategy`/`AuthApiService`), remover a referência e rebuildar.

- [ ] **Step 5: Commit**

```bash
git add -A backend/src backend/.env.example
git commit -m "chore(auth): remover OIDC/ZonaDev/JWKS/AuthApiService e env legado"
```

---

### Task 12: Script `create-admin`

**Files:**
- Create: `backend/scripts/create-admin.ts`

**Interfaces:**
- Uso: `ADMIN_EMAIL=a@b.c ADMIN_NOME='Admin' ADMIN_SENHA='...' TENANT_ID=<uuid> npx ts-node scripts/create-admin.ts` (ou `--print` p/ só imprimir SQL).

- [ ] **Step 1: Implementar**

Create `backend/scripts/create-admin.ts`:
```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

async function main() {
  const email = required('ADMIN_EMAIL');
  const nome = required('ADMIN_NOME');
  const senha = required('ADMIN_SENHA');
  const tenantId = required('TENANT_ID');
  const printOnly = process.argv.includes('--print');

  const senha_hash = await argon2.hash(senha, { type: argon2.argon2id });
  const userUuid = randomUUID();

  if (printOnly) {
    console.log(`-- rode no banco:
INSERT INTO usuarios (uuid, tenant_id, email, nome, senha_hash, roles, is_active, created_at, updated_at)
VALUES ('${userUuid}', '${tenantId}', '${email}', '${nome}', '${senha_hash}', '["admin"]', true, now(), now());
-- crie o TenantRole 'admin' e o local_user apontando authUserId='${userUuid}'.`);
    return;
  }

  const ds = new DataSource({ type: 'postgres', url: required('DATABASE_URL') });
  await ds.initialize();
  await ds.transaction(async (m) => {
    await m.query(
      `INSERT INTO usuarios (uuid, tenant_id, email, nome, senha_hash, roles, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,true,now(),now())`,
      [userUuid, tenantId, email, nome, senha_hash, JSON.stringify(['admin'])],
    );
    const role = await m.query(
      `INSERT INTO tenant_roles (tenant_id, name, description, active, created_at, updated_at)
       VALUES ($1,'admin','Role administrativa',true,now(),now())
       ON CONFLICT (tenant_id, name) DO UPDATE SET active = true
       RETURNING id`,
      [tenantId],
    );
    await m.query(
      `INSERT INTO local_users (tenant_id, auth_user_id, email, role_id, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,true,now(),now())`,
      [tenantId, userUuid, email, role[0].id],
    );
  });
  await ds.destroy();
  console.log(`Admin criado: ${email} (uuid ${userUuid})`);
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`env ${key} obrigatória`);
  return v;
}

main().catch((err) => { console.error(err); process.exit(1); });
```
> Confirmar nomes reais de colunas de `tenant_roles`/`local_users` (via `003_tenant_rbac_model.sql`) e a constraint `ON CONFLICT (tenant_id, name)` antes de rodar sem `--print`.

- [ ] **Step 2: Smoke (print mode, sem DB)**

Run: `cd backend && ADMIN_EMAIL=a@b.c ADMIN_NOME=Admin ADMIN_SENHA=senha1234 TENANT_ID=00000000-0000-0000-0000-000000000001 npx ts-node scripts/create-admin.ts --print`
Expected: imprime o bloco SQL com hash argon2 e uuid.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/create-admin.ts
git commit -m "feat(auth): script create-admin (insert manual do 1o admin)"
```

---

### Task 13: Frontend — login nativo, refresh, remoção do OIDC

**Files:**
- Create: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/components/ProtectedRoute.tsx`
- Modify: `frontend/src/lib/auth.ts`
- Modify: `frontend/src/lib/apiClient.ts`
- Modify: `frontend/src/store/authStore.ts`
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/pages/AuthCallback.tsx`
- Modify: `frontend/src/pages/configuracoes/UsuariosPage.tsx`

**Interfaces:**
- `AuthContext.login(email, password): Promise<void>` (POST `/auth/login`), `logout()` (POST `/auth/logout` → `/login`).

- [ ] **Step 1: `lib/auth.ts` — refresh com mutex**

Replace `frontend/src/lib/auth.ts`:
```ts
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export function clearToken(): void { /* no-op: fluxo por cookie */ }

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const finalOpts: RequestInit = { ...opts, credentials: 'include' };
  let res = await fetch(url, finalOpts);

  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok) {
      res = await fetch(url, finalOpts); // repete uma vez
    } else {
      window.location.href = '/login';
      throw new Error('Sessão expirada');
    }
  }
  return res;
}
```

- [ ] **Step 2: `lib/apiClient.ts` — 401 vai p/ /login**

Edit `frontend/src/lib/apiClient.ts`: no bloco `if (res.status === 401)`, substituir o redirect OIDC por:
```ts
  if (res.status === 401 && !window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
```
(remover a montagem de `${API_BASE}/auth/oidc/start`).

- [ ] **Step 3: `AuthContext` — login/logout nativos**

Edit `frontend/src/context/AuthContext.tsx`:
- Remover `AUTH_URL`.
- Adicionar `login` ao value/interface:
```ts
const login = useCallback(async (email: string, password: string) => {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha: password }),
  });
  if (!res.ok) throw new Error('credenciais inválidas');
  await loadUser();
}, [loadUser]);
```
- Substituir `logout`:
```ts
const logout = useCallback(async () => {
  try { await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include' }); }
  finally { setUser(null); setPermissions([]); window.location.href = '/login'; }
}, []);
```
- Incluir `login` no `AuthContextValue` e no `useMemo`.
> **Fix crítico (case de role):** `isAdmin`/`hasPermission` checavam `roles.includes('ADMIN')` (maiúsculo). Roles nativas são **minúsculas** (`normalizeRoleName` → `'admin'`), então o admin nativo seria bloqueado na rota `adminOnly` (`configuracoes`). Trocar por comparação case-insensitive (`r.toLowerCase() === 'admin'`). `AuthUser.plan`/`defaultRole` viram opcionais no `types/index.ts` (o novo `/me` não os retorna; nenhum consumo em runtime).

- [ ] **Step 4: `ProtectedRoute` — sem user vai p/ /login**

Edit `frontend/src/components/ProtectedRoute.tsx`: substituir o bloco `if (!user) { window.location.href = ...oidc/start... }` por:
```tsx
  if (!user) {
    return <Navigate to='/login' replace />;
  }
```

- [ ] **Step 5: Página de login**

Create `frontend/src/pages/Login.tsx`:
```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
type Form = z.infer<typeof schema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } =
    useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Form) {
    setError(null);
    try {
      await login(values.email, values.password);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Credenciais inválidas');
    }
  }

  return (
    <div className='min-h-screen flex items-center justify-center bg-[#F4F7F6]'>
      <form onSubmit={handleSubmit(onSubmit)} className='w-full max-w-sm space-y-4 p-8 bg-white rounded-xl shadow'>
        <h1 className='text-xl font-semibold text-slate-900'>Entrar</h1>
        <input {...register('email')} type='email' placeholder='Email' className='w-full border rounded-lg px-3 py-2' />
        <input {...register('password')} type='password' placeholder='Senha' className='w-full border rounded-lg px-3 py-2' />
        {error && <p className='text-sm text-red-600'>{error}</p>}
        <button type='submit' disabled={isSubmitting}
          className='w-full bg-[#2A9D8F] text-white rounded-lg py-2 disabled:opacity-60'>
          {isSubmitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
```
> Confirmar que `@hookform/resolvers` e `zod` já estão no `frontend/package.json` (memória indica React Hook Form + Zod no stack). Se faltar, `npm install @hookform/resolvers zod` no `frontend`.

- [ ] **Step 6: Rotas — add /login, remove /callback**

Edit `frontend/src/App.tsx`: remover `import AuthCallback` e a `<Route path='/callback' .../>`; adicionar rota pública:
```tsx
import Login from '@/pages/Login';
// dentro de <Routes>, antes das rotas protegidas:
<Route path='/login' element={<Login />} />
```
Depois: `cd frontend && rm src/pages/AuthCallback.tsx`.

- [ ] **Step 7: `authStore` logout**

Edit `frontend/src/store/authStore.ts`: no `logout`, trocar a chamada `/auth/oidc/logout` por `POST /auth/logout` e redirecionar p/ `/login`:
```ts
logout: async () => {
  const apiUrl = import.meta.env.VITE_API_URL ?? '/api';
  try { await fetch(`${apiUrl}/auth/logout`, { method: 'POST', credentials: 'include' }); }
  finally { set({ user: null, isAuthenticated: false }); window.location.href = '/login'; }
},
```

- [ ] **Step 8: `UsuariosPage` — campos de senha**

Edit `frontend/src/pages/configuracoes/UsuariosPage.tsx`: no formulário de criar usuário, adicionar campos `nome` e `senha` ao payload do `POST /users` (`{ email, nome, senha, role }`); adicionar ação "resetar senha" que faz `PATCH /users/:id` com `{ new_password }`.
> Ler o componente atual e seguir seu padrão de form/validação; manter estados loading/erro/vazio.

- [ ] **Step 9: Build + commit**

Run: `cd frontend && npm run build`
Expected: compila sem erro de tipo.
```bash
git add -A frontend/src
git commit -m "feat(frontend): login nativo + refresh + remoção do fluxo OIDC"
```

---

### Task 14: Verificação end-to-end (manual/smoke)

**Files:** nenhum (validação).

- [ ] **Step 1: Backend sobe e registra rotas nativas**

Run: `cd backend && npm run build && npm run start:dev` (ou `node dist/main`) com `.env` de dev (inclui `RENOWA_AT_SECRET`, `DATABASE_URL`, `RENOWA_JWT_SECRET`).
Expected: log de boot sem erro; `GET /api/health` (se existir) responde. Rotas `auth/login`, `auth/refresh`, `auth/logout` aparecem no log do Nest.

- [ ] **Step 2: Criar admin e logar**

Run: script da Task 12 (modo real, contra o DB de dev) → depois:
```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"a@b.c","senha":"senha1234"}'
curl -i -b cookies.txt http://localhost:3000/api/auth/me
```
Expected: login → `204` + `Set-Cookie renowa_at`/`renowa_rt`; `/me` → `200` com `sub/email/roles/tenantId`.

- [ ] **Step 3: Refresh + logout**

Run:
```bash
curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/refresh
curl -i -b cookies.txt -X POST http://localhost:3000/api/auth/logout
curl -i -b cookies.txt -X POST http://localhost:3000/api/auth/refresh
```
Expected: 1º refresh → `204` (novos cookies); logout → `204`; refresh pós-logout → `401`.

- [ ] **Step 4: Suite de testes**

Run: `cd backend && npx jest`
Expected: todas as specs PASS.

- [ ] **Step 5: Registrar na doc viva**

Acionar `docs-reporter` para registrar a conclusão da FASE 1 (BUGFIX_LOG/SYSTEM_OVERVIEW) e mover os itens FUTURO cobertos em BACKLOG-0009.

---

## Notas de execução (ordem e dependências)

- Ordem obrigatória: **0 → 1 → 2/3/4 (paralelizáveis) → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14**.
- O build backend só fecha 100% após a Task 9 (wiring do `AuthModule`) e a Task 11 (remoção de órfãos). Builds intermediários podem acusar imports do que ainda será removido — ok.
- FASE 0 (hardening) e FASE 2 (integridade) permanecem fora desta rodada.
