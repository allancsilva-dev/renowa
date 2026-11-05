import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSION_SLUGS } from '@renowa/shared';
import { describe, expect, it } from 'vitest';

/**
 * Teste de contrato entre a interface e o catálogo de RBAC.
 *
 * O drift que isto impede voltar: o backend protegia os endpoints, mas a UI
 * deixava rota e item de menu abertos — o usuário navegava, preenchia e só
 * então tomava 403. E slug escrito errado na tela falha em silêncio, porque
 * `hasPermission` de um slug inexistente simplesmente devolve `false`.
 */
const src = (relative: string) => readFileSync(resolve(__dirname, '..', relative), 'utf8');

const appSource = src('App.tsx');
const sidebarSource = src('components/layout/Sidebar.tsx');

/** Módulos com tela própria e slug de leitura no catálogo. */
const MODULE_ROUTES: Array<[path: string, permission: string]> = [
  ['clientes', 'clientes.ver'],
  ['pedidos', 'pedidos.ver'],
  ['produtos', 'produtos.ver'],
  ['fornecedores', 'fornecedores.ver'],
  ['transporte', 'transportadoras.ver'],
  ['financeiro', 'financeiro.ver'],
  ['faturamento', 'faturamento.ver'],
  ['sac', 'sac.ver'],
];

describe('contrato de RBAC do frontend', () => {
  it.each(MODULE_ROUTES)('a rota /%s declara %s', (path, permission) => {
    // A rota do módulo tem de aparecer com o ProtectedRoute que exige o slug —
    // a sidebar filtrada não cobre a URL digitada à mão.
    const routeBlock = new RegExp(
      `path='${path}'[\\s\\S]{0,200}?<ProtectedRoute permission='${permission}'>`,
    );
    expect(appSource).toMatch(routeBlock);
  });

  it.each(MODULE_ROUTES)('o item de menu /%s declara %s', (path, permission) => {
    const navItem = new RegExp(`to: '/${path}'[^\\n]*permission: '${permission}'`);
    expect(sidebarSource).toMatch(navItem);
  });

  it('todo slug citado em App.tsx e na Sidebar existe no catálogo', () => {
    const cited = new Set<string>();
    for (const source of [appSource, sidebarSource]) {
      for (const match of source.matchAll(/permission(?:=|: )'([a-z]+\.[a-z]+)'/g)) {
        cited.add(match[1]);
      }
    }

    expect(cited.size).toBeGreaterThan(0);
    const desconhecidos = [...cited].filter((slug) => !(PERMISSION_SLUGS as readonly string[]).includes(slug));
    expect(desconhecidos).toEqual([]);
  });

  it('o dashboard segue sem slug próprio — não existe permissão para ele no catálogo', () => {
    // Se um dia nascer `dashboard.ver`, este teste falha e obriga a decidir.
    expect((PERMISSION_SLUGS as readonly string[]).some((slug) => slug.startsWith('dashboard.'))).toBe(false);
  });
});
