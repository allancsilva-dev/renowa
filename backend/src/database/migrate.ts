import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const MIGRATION_FILE = /^\d{4}_[a-z0-9_-]+\.sql$/;
const ADVISORY_LOCK_ID = 1_984_060_912;

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL é obrigatória para migrations');

  const migrationsDir = join(__dirname, 'migrations');
  const client = new Client({ connectionString });
  await client.connect();

  try {
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
        if (applied.rows[0].checksum !== checksum) {
          throw new Error(`Migration já aplicada foi alterada: ${file}`);
        }
        continue;
      }

      await client.query('BEGIN');
      try {
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
