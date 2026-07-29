import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { CHECKSUMS_SUPERSEDIDOS } from './migrate';

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

// Versões antigas de migrations já aplicadas, preservadas para provar que o
// checksum antigo aceito em `CHECKSUMS_SUPERSEDIDOS` corresponde a um arquivo
// real. O runner não enxerga o subdiretório: `readdir` não é recursivo e
// `.superseded` não casa com `ACEITO_PELO_RUNNER`.
const DIR_SUPERSEDIDOS = join(DIR, '.superseded');

// Comando de transação escrito pela própria migration. `BEGIN`/`END` de bloco
// `DO $$ ... $$` é outra coisa: é corpo de função, não tem `;` logo depois.
const CONTROLE_DE_TRANSACAO = /^(BEGIN|COMMIT|ROLLBACK)\s*;/i;

const arquivos = readdirSync(DIR).filter((nome) => nome.endsWith('.sql'));

/** Linhas úteis de um SQL: sem comentário `--`, sem controle de transação, sem vazias. */
function linhasSemControleDeTransacao(sql: string): string[] {
  return sql
    .split('\n')
    .map((linha) => linha.trim())
    .filter((texto) => texto !== '')
    .filter((texto) => !texto.startsWith('--'))
    .filter((texto) => !CONTROLE_DE_TRANSACAO.test(texto));
}

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
      .filter(({ texto }) => CONTROLE_DE_TRANSACAO.test(texto));

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

/**
 * PROB-0072: `0007` foi alterada depois de aplicada, e o runner trata migration
 * aplicada como imutável. A allowlist destrava isso, mas afrouxa a única
 * proteção contra o cenário PROB-0059 (arquivo editado sem o banco saber).
 *
 * Estes casos são a contrapartida: um hash só é aceito se existir uma fixture
 * que produza exatamente ele, e se a diferença para o arquivo em vigor for
 * apenas controle de transação. Hash inventado não passa. Tudo offline — sem
 * `git` (o CI faz clone raso) e sem banco.
 */
describe('Checksums supersedidos', () => {
  const entradas = Object.entries(CHECKSUMS_SUPERSEDIDOS);

  it.each(entradas)('%s: cada hash aceito tem fixture correspondente', (arquivo, hashes) => {
    for (const hash of hashes) {
      const prefixo = hash.slice(0, 8);
      const fixture = join(DIR_SUPERSEDIDOS, arquivo.replace(/\.sql$/, `.${prefixo}.sql`));

      expect(existsSync(fixture)).toBe(true);

      const real = createHash('sha256').update(readFileSync(fixture, 'utf8')).digest('hex');
      expect(real).toBe(hash);
    }
  });

  it.each(entradas)('%s: fixture difere do arquivo atual só em transação', (arquivo, hashes) => {
    const atual = linhasSemControleDeTransacao(readFileSync(join(DIR, arquivo), 'utf8'));

    for (const hash of hashes) {
      const prefixo = hash.slice(0, 8);
      const fixture = join(DIR_SUPERSEDIDOS, arquivo.replace(/\.sql$/, `.${prefixo}.sql`));

      expect(linhasSemControleDeTransacao(readFileSync(fixture, 'utf8'))).toEqual(atual);
    }
  });

  it('nenhuma fixture em .superseded/ fica órfã', () => {
    const referenciadas = new Set(
      entradas.flatMap(([arquivo, hashes]) =>
        hashes.map((hash) => arquivo.replace(/\.sql$/, `.${hash.slice(0, 8)}.sql`)),
      ),
    );
    const presentes = existsSync(DIR_SUPERSEDIDOS)
      ? readdirSync(DIR_SUPERSEDIDOS).filter((nome) => nome.endsWith('.sql'))
      : [];

    expect(presentes.filter((nome) => !referenciadas.has(nome))).toEqual([]);
  });

  it('o runner ignora o diretório .superseded/', () => {
    expect(arquivos).not.toContain('.superseded');
    expect(arquivos.some((nome) => nome.includes('.superseded'))).toBe(false);
  });
});
