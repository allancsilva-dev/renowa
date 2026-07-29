import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { buildErasureSql, PII_REGISTRY, TABELAS_SEM_PII } from './pii-registry';

/**
 * BACKLOG-0054, metade offline: é este teste que impede a próxima tabela de
 * repetir a omissão do PROB-0075.
 *
 * `pedido_fotos`, `chamados_sac` e `itens_chamado_sac` entraram no sistema sem
 * que nada perguntasse se guardavam PII, e ficaram fora do ERASURE por meses
 * enquanto a migration afirmava por escrito que estavam cobertas. Aqui, toda
 * entidade com `tenant_id` precisa estar classificada — como tabela com PII ou
 * como isenta justificada. Não classificar quebra a build.
 *
 * Puro `fs`: sem banco, sem `git`. Roda no CI atual.
 */
const SRC = join(__dirname, '..');

function arquivosDeEntidade(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosDeEntidade(caminho);
    return nome.endsWith('.entity.ts') ? [caminho] : [];
  });
}

const entidades = arquivosDeEntidade(SRC).map((caminho) => {
  const fonte = readFileSync(caminho, 'utf8');
  return {
    caminho,
    tabela: /@Entity\('([a-z_]+)'\)/.exec(fonte)?.[1],
    temTenantId: /tenant_id/.test(fonte),
  };
});

const comTenantId = entidades
  .filter((entidade) => entidade.tabela && entidade.temTenantId)
  .map((entidade) => entidade.tabela as string);

describe('Registro de PII', () => {
  const noRegistro = new Set(PII_REGISTRY.map((plano) => plano.table));
  const isentas = new Set(Object.keys(TABELAS_SEM_PII));

  it('encontrou as entidades para verificar', () => {
    expect(comTenantId.length).toBeGreaterThan(10);
  });

  it.each(comTenantId)('%s está classificada', (tabela) => {
    const classificada = noRegistro.has(tabela) || isentas.has(tabela);

    // A mensagem tem que dizer o que fazer: quem esbarrar nisto está entregando
    // uma tabela nova, não depurando o registro.
    expect(
      classificada
        ? true
        : `Tabela "${tabela}" tem tenant_id e não está classificada. Acrescente um `
          + 'plano em PII_REGISTRY (com o vínculo até o titular e o que apagar) ou '
          + 'uma entrada em TABELAS_SEM_PII com a justificativa de por que não '
          + 'guarda PII de titular.',
    ).toBe(true);
  });

  it('nenhuma tabela está nos dois lados', () => {
    expect([...noRegistro].filter((tabela) => isentas.has(tabela))).toEqual([]);
  });

  it('nenhuma entrada aponta para tabela inexistente', () => {
    const existentes = new Set(comTenantId);
    const fantasmas = [...noRegistro, ...isentas].filter((tabela) => !existentes.has(tabela));

    expect(fantasmas).toEqual([]);
  });

  it('toda isenção tem justificativa não trivial', () => {
    for (const [tabela, motivo] of Object.entries(TABELAS_SEM_PII)) {
      expect(motivo.length).toBeGreaterThan(30);
      expect(tabela).not.toBe('');
    }
  });

  it('todo plano declara o motivo de guardar PII', () => {
    for (const plano of PII_REGISTRY) {
      expect(plano.motivo.length).toBeGreaterThan(30);
    }
  });

  /**
   * O primeiro plano do ramo é o que roda `RETURNING id` e resolve o id interno
   * do titular; `own-id` e `via` dependem dele. Reordenar o registro faria
   * `runErasure` lançar — este caso pega antes de virar exceção em produção.
   *
   * Outros planos podem ser `own-uuid` (`local_users.auth_user_id`,
   * `mobile_sessions.user_uuid` são chaveados pelo uuid, não pelo id): o que
   * não pode é um plano dependente do id vir antes de quem o resolve.
   */
  it.each(['CLIENT', 'USER'] as const)('o ramo %s começa pela tabela do titular', (subject) => {
    const doRamo = PII_REGISTRY.filter((plano) => plano.subject === subject);

    expect(doRamo[0].vinculo.kind).toBe('own-uuid');

    const primeiroDependente = doRamo.findIndex((plano) => plano.vinculo.kind !== 'own-uuid');
    if (primeiroDependente !== -1) expect(primeiroDependente).toBeGreaterThan(0);
  });
});

describe('SQL gerado pelo registro', () => {
  it.each(PII_REGISTRY.map((plano) => [plano.table, plano] as const))(
    '%s gera UPDATE com escopo de tenant',
    (_tabela, plano) => {
      const sql = buildErasureSql(plano);

      expect(sql).toMatch(/^UPDATE [a-z_]+ SET /);
      // Sem isto o apagamento de um tenant alcançaria linha de outro.
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(sql).not.toContain('undefined');
    },
  );

  it('só usa $3 quando alguma coluna é marcador', () => {
    for (const plano of PII_REGISTRY) {
      const usaMarcador = Object.values(plano.columns).some((e) => e.set === 'marker');
      expect(buildErasureSql(plano).includes('$3')).toBe(usaMarcador);
    }
  });

  // `itens_chamado_sac.motivo` é NOT NULL (0035:90). NULL ali aborta o ERASURE
  // inteiro com 23502 — o fluxo não tem retomada parcial.
  it('não emite NULL para motivo de item de SAC', () => {
    const plano = PII_REGISTRY.find((p) => p.table === 'itens_chamado_sac');

    expect(plano).toBeDefined();
    expect(buildErasureSql(plano!)).not.toContain('motivo = NULL');
    expect(buildErasureSql(plano!)).toContain("motivo = '[removido - LGPD]'");
  });

  // Toda tabela com concorrência otimista precisa bumpar `version`, senão um
  // cliente com a linha em cache sobrescreve o apagamento no próximo push.
  it.each(['clientes', 'pedidos', 'pedido_fotos', 'chamados_sac', 'itens_chamado_sac'])(
    '%s incrementa version',
    (tabela) => {
      const plano = PII_REGISTRY.find((p) => p.table === tabela);

      expect(buildErasureSql(plano!)).toContain('version = version + 1');
    },
  );
});
