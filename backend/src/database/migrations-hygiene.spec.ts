import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Invariantes do runner de migrations (`migrate.ts`), transformadas em teste.
 *
 * Os dois problemas que motivam cada caso já aconteceram neste repositório e
 * têm a mesma assinatura traiçoeira: a migration "passa", `schema_migrations`
 * registra, e o objeto não existe no banco.
 */
const DIR = join(__dirname, 'migrations');

// Mesmo regex de `migrate.ts`. Arquivo fora dele é ignorado em silêncio.
const ACEITO_PELO_RUNNER = /^\d{4}_[a-z0-9_-]+\.sql$/;

// Legado pré-baseline: substituídos por `0000_baseline.sql` e deliberadamente
// ignorados pelo runner. Não podem crescer.
const LEGADO_TRES_DIGITOS = /^\d{3}_[a-z0-9_-]+\.sql$/;

const arquivos = readdirSync(DIR).filter((nome) => nome.endsWith('.sql'));

describe('Higiene das migrations', () => {
  it('tem migrations para verificar', () => {
    expect(arquivos.length).toBeGreaterThan(0);
  });

  // BACKLOG-0035: `0007` abria BEGIN/COMMIT próprios dentro da transação do
  // runner. O COMMIT interno encerrava a transação EXTERNA antes do INSERT em
  // `schema_migrations` — a atomicidade sumia justo no banco vazio.
  it.each(arquivos)('%s não controla transação por conta própria', (nome) => {
    const sql = readFileSync(join(DIR, nome), 'utf8');
    const linhas = sql
      .split('\n')
      .map((linha, indice) => ({ numero: indice + 1, texto: linha.trim() }))
      // Comentário citando BEGIN/COMMIT é legítimo (inclusive o de 0007).
      .filter(({ texto }) => !texto.startsWith('--'))
      // `BEGIN`/`END` de bloco DO $$ ... $$ é outra coisa: é corpo de função.
      .filter(({ texto }) => /^(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(texto));

    expect(linhas).toEqual([]);
  });

  it('todo arquivo novo é visível para o runner (4 dígitos)', () => {
    const invisiveis = arquivos.filter(
      (nome) => !ACEITO_PELO_RUNNER.test(nome) && !LEGADO_TRES_DIGITOS.test(nome),
    );

    expect(invisiveis).toEqual([]);
  });

  it('não surgiu migration nova de 3 dígitos (o runner nunca a executaria)', () => {
    const legado = arquivos.filter((nome) => LEGADO_TRES_DIGITOS.test(nome)).sort();

    expect(legado).toEqual([
      '001_initial_schema.sql',
      '002_local_permissions.sql',
      '003_tenant_rbac_model.sql',
      '004_local_users_last_login_at.sql',
      '005_native_auth.sql',
      '006_users_manage_permission.sql',
      '007_tenant_role_permissions_tenant.sql',
    ]);
  });
});
