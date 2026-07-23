/**
 * db:bootstrap — cria o primeiro tenant/admin de um banco VAZIO.
 *
 * POR QUE ISTO EXISTE
 * Não há cadastro público: `auth.controller.ts` expõe login/refresh/logout/
 * change-password/mobile-session/me, e nada mais. Usuário só nasce por
 * `POST /users`, que exige um admin já autenticado. Num banco vazio isso é um
 * impasse — alguém precisa criar o primeiro.
 *
 * POR QUE NÃO É UM SCRIPT COM SQL PRÓPRIO
 * O antecessor (`scripts/create-admin.ts`) inseria em `usuarios`,
 * `tenant_roles` e `local_users` com SQL cru e NÃO gravava nada em
 * `tenant_role_permissions`. Como o bypass hardcoded de admin foi removido do
 * `PermissionGuard` (só `SUPERADMIN` resta) e o backfill das migrations 0025/
 * 0030 roda antes de qualquer role existir, o admin nascia sem permissão
 * nenhuma: login passava e todo endpoint devolvia 403.
 *
 * Aqui subimos o próprio AppModule e chamamos `UsersService.createTenantUser`
 * — o MESMO caminho de `POST /users`. Assim `ensureTenantRoleWith` continua o
 * único lugar do sistema que traduz nome de papel em permissões
 * (DEFAULT_ROLE_PERMISSIONS/SYSTEM_ROLE_NAMES de @renowa/shared), tudo numa
 * transação só. Duplicar essa regra aqui sairia de sincronia no primeiro slug
 * novo do catálogo.
 *
 * IDEMPOTENTE: rodar de novo com o mesmo e-mail não duplica nem falha feio.
 *
 * USO
 *   ADMIN_EMAIL=... ADMIN_NOME=... ADMIN_SENHA=... TENANT_ID=$(uuidgen) \
 *     npm run db:bootstrap
 *
 * Saída: 0 = admin pronto (criado agora ou já existente); 1 = falha.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';

const ROLE_ADMIN = 'admin';

function obrigatoria(chave: string): string {
  const valor = process.env[chave]?.trim();
  if (!valor) throw new Error(`Variável de ambiente ${chave} é obrigatória`);
  return valor;
}

export async function bootstrapTenant(): Promise<void> {
  const tenantId = obrigatoria('TENANT_ID');
  const dto = plainToInstance(CreateUserDto, {
    email: obrigatoria('ADMIN_EMAIL'),
    nome: obrigatoria('ADMIN_NOME'),
    senha: obrigatoria('ADMIN_SENHA'),
    role: ROLE_ADMIN,
  });

  // Sem HTTP não há ValidationPipe global: validar aqui mantém as mesmas
  // regras de POST /users (e-mail válido, senha >= 8).
  const erros = await validate(dto);
  if (erros.length) {
    const detalhe = erros
      .map((erro) => Object.values(erro.constraints ?? {}).join('; '))
      .join(' | ');
    throw new Error(`Dados do admin inválidos: ${detalhe}`);
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error(`TENANT_ID precisa ser um UUID (ex.: ${randomUUID()})`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const users = app.get(UsersService);
    const criado = await users.createTenantUser(tenantId, dto);
    console.log(
      `Admin criado: ${criado.email} (papel ${criado.role}, tenant ${criado.tenantId}).`,
    );
  } catch (erro) {
    // `createTenantUser` recusa e-mail repetido — é o caminho de re-execução.
    if (erro instanceof BadRequestException && /já cadastrado/i.test(erro.message)) {
      console.log(`Admin já existe (${dto.email}). Nada a fazer.`);
      return;
    }
    throw erro;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  bootstrapTenant()
    .then(() => process.exit(0))
    .catch((erro) => {
      console.error(erro instanceof Error ? erro.message : erro);
      process.exit(1);
    });
}
