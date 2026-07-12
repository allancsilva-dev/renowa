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
-- crie o tenant_role 'admin' e o local_user apontando auth_user_id='${userUuid}'.`);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
