import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const MIGRATION_FILE = /^\d{4}_[a-z0-9_-]+\.sql$/;
const ADVISORY_LOCK_ID = 1_984_060_912;

/**
 * Migrations cujo ARQUIVO mudou depois de já terem sido aplicadas, e cujo
 * checksum antigo continua sendo aceito porque o efeito no schema é idêntico.
 *
 * `0007`: o commit 0f066ae removeu o BEGIN/COMMIT interno do arquivo (o COMMIT
 * encerrava a transação EXTERNA do runner antes do INSERT em schema_migrations,
 * BACKLOG-0035). Só controle de transação mudou — nenhum DDL. Confirmado no
 * catálogo: coluna `version` NOT NULL DEFAULT 1 e `<tabela>_version_check`
 * presentes nas 5 tabelas. Sem esta entrada, TODO banco provisionado antes de
 * 0f066ae — dev e produção — fica travado. Ver PROB-0072.
 *
 * A versão antiga está preservada em `migrations/.superseded/` e
 * `migrations-hygiene.spec.ts` prova que este hash corresponde a ela e que a
 * única diferença para o arquivo atual é controle de transação.
 *
 * Entrada nova aqui é exceção, não rotina: só entra quando a alteração do
 * arquivo comprovadamente não mexeu em DDL.
 */
export const CHECKSUMS_SUPERSEDIDOS: Record<string, readonly string[]> = {
  '0007_optimistic_concurrency.sql': [
    'f5d5654ce8b0c55c54f4c127c1f1123fa1b3f642f4fa5e3586454227a5de4c63',
  ],
};

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória para migrations');

  const migrationsDir = join(__dirname, 'migrations');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query(`SET TIME ZONE 'UTC'`);
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name varchar(255) PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await fs.readdir(migrationsDir)).filter((file) => MIGRATION_FILE.test(file)).sort();

    for (const file of files) {
      const sql = await fs.readFile(join(migrationsDir, file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query<{ checksum: string }>(
        'SELECT checksum FROM public.schema_migrations WHERE name = $1',
        [file],
      );

      if (applied.rowCount) {
        const registrado = applied.rows[0].checksum;
        const aceito =
          registrado === checksum || (CHECKSUMS_SUPERSEDIDOS[file] ?? []).includes(registrado);
        if (!aceito) {
          throw new Error(`Migration já aplicada foi alterada: ${file}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
        // `0000_baseline.sql` é dump do pg_dump e traz
        // `set_config('search_path', '', false)`. O terceiro argumento `false`
        // faz valer para a SESSÃO inteira, e o runner usa UMA conexão para
        // todos os arquivos: sem este reset, toda migration seguinte com nome
        // não-qualificado (`ALTER TABLE produtos`) morre com
        // `3F000: no schema has been selected to create in`.
        //
        // O sintoma só aparece em banco VAZIO, porque é o único cenário em que
        // o baseline roda junto com as demais. Rodar `db:migrate` uma segunda
        // vez "consertava" — o baseline já estava registrado e não reexecutava.
        // Era o provisionamento do zero quebrado (BACKLOG-0039).
        await client.query('SET search_path TO public');
        await client.query(sql);
        await client.query(
          'INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)',
          [file, checksum],
        );
        await client.query('COMMIT');
        console.log(`Migration aplicada: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]).catch(() => undefined);
    await client.end();
  }
}
