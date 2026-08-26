import { describe, expect, it } from 'vitest';
import { mergeRoleOptions } from '@/lib/roleOptions';

const nomes = (opts: ReturnType<typeof mergeRoleOptions>) => opts.map((o) => o.name);
const rotulo = (opts: ReturnType<typeof mergeRoleOptions>, name: string) =>
  opts.find((o) => o.name === name)?.label;

describe('mergeRoleOptions', () => {
  it('inclui os perfis do tenant e os templates ainda não materializados', () => {
    const opts = mergeRoleOptions([{ name: 'qa_ui', permissions: ['clientes.ver'] }]);
    expect(nomes(opts)).toContain('qa_ui');
    for (const template of ['admin', 'gestao', 'vendedor', 'financeiro']) {
      expect(nomes(opts)).toContain(template);
    }
  });

  it('não duplica um template que já existe no tenant', () => {
    const opts = mergeRoleOptions([{ name: 'admin', permissions: ['usuarios.gerenciar'] }]);
    expect(nomes(opts).filter((n) => n === 'admin')).toHaveLength(1);
  });

  // Achado do teste de UI: `viewer` existia no tenant com ZERO permissões e era
  // oferecido sem nada indicar — quem escolhesse criava um usuário que loga e
  // toma 403 em toda tela, o mesmo sintoma que FIX-0028 fechou.
  it('marca perfil do tenant sem nenhuma permissão', () => {
    const opts = mergeRoleOptions([{ name: 'viewer', permissions: [] }]);
    expect(rotulo(opts, 'viewer')).toMatch(/sem permissões/);
    expect(opts.find((o) => o.name === 'viewer')?.semPermissoes).toBe(true);
  });

  it('não marca perfil que concede algo', () => {
    const opts = mergeRoleOptions([{ name: 'manager', permissions: ['clientes.ver'] }]);
    expect(rotulo(opts, 'manager')).not.toMatch(/sem permissões/);
  });

  // Segundo achado: `formatRoleName` faz title-case, então `VENDEDOR` e
  // `vendedor` — perfis distintos, ids distintos — renderizavam "Vendedor" nos
  // dois, indistinguíveis no select.
  it('desambigua rótulos que colidem mostrando o nome cru', () => {
    const opts = mergeRoleOptions([
      { name: 'VENDEDOR', permissions: ['pedidos.ver'] },
      { name: 'vendedor', permissions: ['pedidos.ver'] },
    ]);
    expect(rotulo(opts, 'VENDEDOR')).toBe('Vendedor (VENDEDOR)');
    expect(rotulo(opts, 'vendedor')).toBe('Vendedor (vendedor)');
  });

  it('não desambigua quando não há colisão', () => {
    const opts = mergeRoleOptions([{ name: 'vendedor', permissions: ['pedidos.ver'] }]);
    expect(rotulo(opts, 'vendedor')).toBe('Vendedor');
  });

  it('trata permissions ausente como zero permissões', () => {
    const opts = mergeRoleOptions([{ name: 'orfao' }]);
    expect(opts.find((o) => o.name === 'orfao')?.semPermissoes).toBe(true);
  });
});
