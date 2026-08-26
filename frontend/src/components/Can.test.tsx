// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Can } from './Can';

const grantedSlugs = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    hasPermission: (slug: string) => grantedSlugs.current.includes(slug),
  }),
}));

// Sem arquivo de setup global, o auto-cleanup do testing-library não roda:
// sem isto, o DOM acumula entre casos e "não renderizou" passa a achar o
// botão do caso anterior.
afterEach(cleanup);

function renderWith(slugs: string[], ui: React.ReactNode) {
  cleanup();
  grantedSlugs.current = slugs;
  return render(<>{ui}</>);
}

describe('Can', () => {
  it('renderiza quando o slug está concedido', () => {
    renderWith(['clientes.criar'], <Can permission='clientes.criar'><button>Novo</button></Can>);
    expect(screen.getByRole('button', { name: 'Novo' })).toBeTruthy();
  });

  it('some quando o slug não está concedido', () => {
    renderWith([], <Can permission='clientes.criar'><button>Novo</button></Can>);
    expect(screen.queryByRole('button', { name: 'Novo' })).toBeNull();
  });

  it('renderiza o fallback no lugar quando informado', () => {
    renderWith([], <Can permission='produtos.editar' fallback={<span>—</span>}><button>Editar</button></Can>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('—')).toBeTruthy();
  });

  // O padrão espelha o do backend: sem modo declarado, `@RequirePermission`
  // exige todas as permissões da lista.
  it('lista sem modo exige TODAS as permissões', () => {
    renderWith(['pedidos.ver'], <Can permission={['pedidos.ver', 'pedidos.editar']}><button>Ação</button></Can>);
    expect(screen.queryByRole('button')).toBeNull();

    renderWith(['pedidos.ver', 'pedidos.editar'], <Can permission={['pedidos.ver', 'pedidos.editar']}><button>Ação</button></Can>);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it("modo 'any' basta uma das permissões", () => {
    renderWith(['pedidos.ver'], <Can permission={['pedidos.ver', 'pedidos.editar']} mode='any'><button>Ação</button></Can>);
    expect(screen.getByRole('button', { name: 'Ação' })).toBeTruthy();
  });

  it("modo 'any' nega quando nenhuma bate", () => {
    renderWith(['sac.ver'], <Can permission={['pedidos.ver', 'pedidos.editar']} mode='any'><button>Ação</button></Can>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
