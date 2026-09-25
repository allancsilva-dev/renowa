import { join } from 'path';
import { DataSource } from 'typeorm';
import { Order } from '../../orders/entities/order.entity';

/**
 * Isolamento de tenant nos joins vem do MAPEAMENTO, não de cada query.
 *
 * Toda relação N:1 entre tabelas com `tenant_id` usa `@JoinColumn` composta
 * `(tenant_id, id)`. Com isso o TypeORM gera o `ON` já com
 * `"filho"."tenant_id"="pai"."tenant_id"`, em qualquer `leftJoin`/`innerJoin`
 * pela relação, sem condição extra na query (BACKLOG-0095/0096).
 *
 * Este teste trava esse invariante: uma entidade nova com FK simples para
 * tabela de tenant passaria a juntar linhas de outro tenant em silêncio.
 */

/** Entidades globais (sem `tenant_id`), onde FK simples é o correto. */
const GLOBAIS = new Set(['Permission']);

async function metadados(): Promise<DataSource> {
  const ds = new DataSource({ type: 'postgres', entities: [join(__dirname, '../../**/*.entity.ts')] });
  // Monta só os metadados: nenhuma conexão com banco é aberta.
  await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  return ds;
}

describe('relações entre tabelas de tenant', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await metadados();
  });

  it('toda FK para tabela de tenant é composta com tenant_id', () => {
    const temTenant = (colunas: { databaseName: string }[]) => colunas.some((c) => c.databaseName === 'tenant_id');
    const violacoes: string[] = [];
    let conferidas = 0;

    for (const entidade of ds.entityMetadatas) {
      if (!temTenant(entidade.columns)) continue;
      for (const relacao of entidade.relations) {
        if (!relacao.isOwning || !relacao.joinColumns.length) continue;
        const alvo = relacao.inverseEntityMetadata;
        if (GLOBAIS.has(alvo.name) || !temTenant(alvo.columns)) continue;
        conferidas += 1;
        if (!relacao.joinColumns.some((c) => c.databaseName === 'tenant_id')) {
          violacoes.push(`${entidade.name}.${relacao.propertyName} → ${alvo.name}`);
        }
      }
    }

    // Sem entidades carregadas o teste passaria vazio: exige que ele confira algo.
    expect(conferidas).toBeGreaterThan(20);
    expect(violacoes).toEqual([]);
  });

  it('o join gerado pela relação já compara tenant_id', () => {
    const sql = ds.createQueryBuilder(Order, 'o')
      .leftJoin('o.cliente', 'cliente')
      .leftJoin('o.itens', 'itens')
      .getQuery();

    expect(sql).toContain('"cliente"."tenant_id"="o"."tenant_id"');
    expect(sql).toContain('"itens"."tenant_id"="o"."tenant_id"');
  });
});
