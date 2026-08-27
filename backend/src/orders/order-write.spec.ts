import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ORDER_ITEM_CASES } from '@renowa/shared';
import {
  assertCodigosItensUnicos,
  assertSemNotasAtivas,
  buildItemValues,
  loadOrderForWrite,
  recomputeOrderTotals,
} from './order-write';

/**
 * Núcleo compartilhado pelas duas portas de escrita de pedido (REST e push de
 * sync) — ver `order-write.ts`. Estes casos cobrem o que a suíte de
 * `OrdersService` não alcança, porque lá o caminho é sempre o DTO completo da
 * web: leitura travada com guarda de origem/status, e re-derivação do pedido
 * inteiro a partir dos insumos gravados.
 */

type Linha = Record<string, unknown>;

function fakeManager(opts: {
  order?: Linha | null;
  items?: Linha[];
  queryRows?: (sql: string) => unknown;
}) {
  const salvos: Linha[] = [];
  const queries: Array<{ sql: string; params?: unknown[] }> = [];

  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(opts.order ?? null),
    findOneOrFail: jest.fn().mockResolvedValue(opts.order ?? {}),
    save: jest.fn(async (row: Linha) => row),
  };
  const itemRepo = {
    find: jest.fn().mockResolvedValue(opts.items ?? []),
    save: jest.fn(async (row: Linha) => {
      salvos.push(row);
      return row;
    }),
  };

  const manager = {
    getRepository: (entity: { name: string }) => (entity.name === 'Order' ? orderRepo : itemRepo),
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return opts.queryRows ? opts.queryRows(sql) : [];
    }),
  };

  return { manager: manager as never, orderRepo, itemRepo, salvos, queries };
}

/**
 * Ownership de vendedor NÃO é checado aqui: o push de sync nunca teve o ator,
 * só o tenant, e passar um `sub` inventado seria mentira de tipo. A lacuna está
 * registrada em `docs/BACKLOG.md` — é anterior a PROB-0065 e vale para todas as
 * entidades do sync, não só pedido.
 */
const TENANT = 't-1';

describe('loadOrderForWrite — guardas de domínio na leitura travada', () => {
  it('trava a linha com pessimistic_write', async () => {
    const { manager, orderRepo } = fakeManager({
      order: { id: 1, uuid: 'p-1', status: 'em_aberto', origem: 'interno', deleted_at: null },
    });

    await loadOrderForWrite(manager, 'p-1', TENANT, { requireEmAberto: true });

    expect(orderRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
      lock: { mode: 'pessimistic_write' },
      where: { uuid: 'p-1', tenant_id: 't-1' },
    }));
  });

  it('recusa pedido inexistente e pedido de outro tenant com a mesma resposta', async () => {
    const { manager } = fakeManager({ order: null });
    await expect(loadOrderForWrite(manager, 'p-1', TENANT)).rejects.toThrow(NotFoundException);
  });

  it('recusa pedido soft-deletado', async () => {
    const { manager } = fakeManager({
      order: { id: 1, uuid: 'p-1', status: 'em_aberto', origem: 'interno', deleted_at: new Date() },
    });
    await expect(loadOrderForWrite(manager, 'p-1', TENANT)).rejects.toThrow(NotFoundException);
  });

  // Pedido externo não tem itens por construção: `createExternal` não cria
  // nenhum e o total é o valor declarado.
  it('recusa origem diferente da exigida', async () => {
    const { manager } = fakeManager({
      order: { id: 1, uuid: 'p-1', status: 'em_aberto', origem: 'externo', deleted_at: null },
    });
    await expect(loadOrderForWrite(manager, 'p-1', TENANT, { requireOrigem: 'interno' }))
      .rejects.toThrow(BadRequestException);
  });

  /**
   * O gate que faltava no sync: até PROB-0065 só pedido EXTERNO era travado
   * fora de `em_aberto`. Item de pedido faturado era livremente mutável.
   */
  it.each(['liberado', 'parcialmente_faturado', 'faturado', 'cancelado'])(
    'recusa edição de pedido interno em %s',
    async (status) => {
      const { manager } = fakeManager({
        order: { id: 1, uuid: 'p-1', status, origem: 'interno', deleted_at: null },
      });
      await expect(loadOrderForWrite(manager, 'p-1', TENANT, { requireEmAberto: true }))
        .rejects.toThrow(BadRequestException);
    },
  );

  it('aceita pedido interno em em_aberto', async () => {
    const { manager } = fakeManager({
      order: { id: 1, uuid: 'p-1', status: 'em_aberto', origem: 'interno', deleted_at: null },
    });
    const order = await loadOrderForWrite(manager, 'p-1', TENANT, {
      requireOrigem: 'interno', requireEmAberto: true,
    });
    expect(order.id).toBe(1);
  });
});

describe('assertSemNotasAtivas', () => {
  it('recusa com 409 quando há nota ativa', async () => {
    const { manager } = fakeManager({ queryRows: () => [{ total: 2 }] });
    await expect(assertSemNotasAtivas(manager, 't-1', 1)).rejects.toThrow(ConflictException);
  });

  it('passa quando não há nota ativa', async () => {
    const { manager } = fakeManager({ queryRows: () => [{ total: 0 }] });
    await expect(assertSemNotasAtivas(manager, 't-1', 1)).resolves.toBeUndefined();
  });
});

describe('buildItemValues — derivação', () => {
  it('preenche os cinco derivados que a allowlist antiga do sync não tinha', async () => {
    const { manager } = fakeManager({ queryRows: () => [{ id: 9, fornecedor_id: 5 }] });

    const values = await buildItemValues(
      manager,
      {
        uuid: 'i-1', produto_uuid: 'prod-1',
        qtd_caixas: 2, qtd_unitaria: 4, preco_unitario: '25.50', desconto_perc: 10, ipi_perc: 10,
      },
      't-1', 1, 5,
    );

    expect(values).toMatchObject({
      qtd_total: '8.000',
      valor_com_desconto: '22.95',
      valor_com_imposto: '25.25',
      total_item: '183.60',
      total_com_imposto: '201.96',
    });
  });

  it('grava ipi_perc nulo quando não informado — "sem IPI" não é "IPI zero"', async () => {
    const { manager } = fakeManager({});
    const values = await buildItemValues(
      manager,
      { uuid: 'i-1', descricao_manual: 'Item avulso', qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '10' },
      't-1', 1, 5,
    );
    expect(values.ipi_perc).toBeNull();
  });

  it('recusa produto de outro fornecedor', async () => {
    const { manager } = fakeManager({ queryRows: () => [{ id: 9, fornecedor_id: 77 }] });
    await expect(buildItemValues(
      manager, { uuid: 'i-1', produto_uuid: 'prod-1' }, 't-1', 1, 5,
    )).rejects.toThrow(BadRequestException);
  });

  it('recusa item sem produto e sem código/descrição manual', async () => {
    const { manager } = fakeManager({});
    await expect(buildItemValues(
      manager, { uuid: 'i-1' }, 't-1', 1, 5,
    )).rejects.toThrow(BadRequestException);
  });
});

describe('recomputeOrderTotals — a derivação é do servidor, sempre', () => {
  /**
   * O caso que PROB-0065 descreve: linha gravada pela porta antiga do sync, com
   * `total_item` de aritmética velha e sem os campos de leitura. Re-derivar a
   * partir dos INSUMOS corrige a linha; ler o `total_item` gravado propagaria o
   * erro para o cabeçalho.
   */
  it('re-deriva item gravado com total errado e regrava o cabeçalho', async () => {
    const itemSujo: Linha = {
      id: 10, uuid: 'i-1', tenant_id: 't-1', pedido_id: 1, deleted_at: null,
      qtd_caixas: '2.000', qtd_unitaria: '4.000', preco_unitario: '25.5000',
      desconto_perc: '10.00', ipi_perc: '10.00',
      // Valores errados/ausentes deixados pela porta antiga.
      qtd_total: null, valor_com_desconto: null, valor_com_imposto: null,
      total_item: '183.61', total_com_imposto: null,
    };
    const { manager, salvos, queries } = fakeManager({
      order: { id: 1, tenant_id: 't-1', total_sem_imposto: '0.00', total_com_imposto: '0.00' },
      items: [itemSujo],
    });

    const totals = await recomputeOrderTotals(manager, 't-1', 1);

    expect(salvos).toHaveLength(1);
    expect(salvos[0]).toMatchObject({
      qtd_total: '8.000', valor_com_desconto: '22.95',
      total_item: '183.60', total_com_imposto: '201.96',
    });
    expect(totals).toMatchObject({
      total_sem_imposto: '183.60', total_com_imposto: '201.96', changed: true,
    });
    expect(queries.some((q) => /UPDATE pedidos SET total_sem_imposto/.test(q.sql))).toBe(true);
  });

  it('ignora item soft-deletado na soma', async () => {
    const vivo: Linha = {
      id: 1, deleted_at: null, qtd_caixas: '1.000', qtd_unitaria: '1.000',
      preco_unitario: '10.0000', desconto_perc: '0.00', ipi_perc: null,
      qtd_total: '1.000', valor_com_desconto: '10.00', valor_com_imposto: '10.00',
      total_item: '10.00', total_com_imposto: '10.00',
    };
    const morto: Linha = { ...vivo, id: 2, deleted_at: new Date() };
    const { manager } = fakeManager({
      order: { id: 1, tenant_id: 't-1', total_sem_imposto: '10.00', total_com_imposto: '10.00' },
      items: [vivo, morto],
    });

    const totals = await recomputeOrderTotals(manager, 't-1', 1);
    expect(totals.total_sem_imposto).toBe('10.00');
  });

  /** Bump gratuito de `version` viraria 409 na web sem nada ter mudado. */
  it('não toca no cabeçalho quando os totais não mudam', async () => {
    const item: Linha = {
      id: 1, deleted_at: null, qtd_caixas: '1.000', qtd_unitaria: '1.000',
      preco_unitario: '10.0000', desconto_perc: '0.00', ipi_perc: null,
      qtd_total: '1.000', valor_com_desconto: '10.00', valor_com_imposto: '10.00',
      total_item: '10.00', total_com_imposto: '10.00',
    };
    // `preco_unitario` chega do banco com a escala da coluna ('10.0000'); a
    // recomputação não pode reescrever INSUMO por diferença de formatação.
    const { manager, salvos, queries } = fakeManager({
      order: { id: 1, tenant_id: 't-1', total_sem_imposto: '10.00', total_com_imposto: '10.00' },
      items: [item],
    });

    const totals = await recomputeOrderTotals(manager, 't-1', 1);

    expect(totals.changed).toBe(false);
    expect(salvos).toHaveLength(0);
    expect(queries.some((q) => /UPDATE pedidos/.test(q.sql))).toBe(false);
  });

  /**
   * Mesma fixture que o `order-calculation.spec.ts` e o frontend consomem: se a
   * política de arredondamento mudar de novo (FIX-0023), a re-derivação do
   * sync muda junto, não meses depois.
   */
  it.each(ORDER_ITEM_CASES.map((caso) => [caso.nome, caso] as const))(
    'reproduz a fixture compartilhada: %s',
    async (_nome, caso) => {
      const item: Linha = {
        id: 1, deleted_at: null,
        qtd_caixas: caso.entrada.qtd_caixas ?? null,
        qtd_unitaria: caso.entrada.qtd_unitaria ?? null,
        preco_unitario: caso.entrada.preco_unitario ?? null,
        desconto_perc: caso.entrada.desconto_perc ?? null,
        ipi_perc: caso.entrada.ipi_perc ?? null,
        total_item: null, total_com_imposto: null,
      };
      const { manager, salvos } = fakeManager({
        order: { id: 1, tenant_id: 't-1', total_sem_imposto: null, total_com_imposto: null },
        items: [item],
      });

      const totals = await recomputeOrderTotals(manager, 't-1', 1);

      expect(salvos[0]).toMatchObject({
        qtd_total: caso.esperado.qtd_total,
        valor_com_desconto: caso.esperado.valor_com_desconto,
        valor_com_imposto: caso.esperado.valor_com_imposto,
        total_item: caso.esperado.total_sem_imposto,
        total_com_imposto: caso.esperado.total_com_imposto,
      });
      expect(totals.total_sem_imposto).toBe(caso.esperado.total_sem_imposto);
      expect(totals.total_com_imposto).toBe(caso.esperado.total_com_imposto);
    },
  );
});

/**
 * Duplicidade de código dentro do pedido. O `fakeManager` acima devolve `[]` por
 * padrão em `query`, então cada caso descreve só as duas consultas que a guarda
 * faz: catálogo de produtos e irmãos vivos do pedido.
 */
describe('assertCodigosItensUnicos — código repetido no mesmo pedido', () => {
  function managerCom(opts: { catalogo?: Linha[]; irmaos?: Linha[] } = {}) {
    return fakeManager({
      queryRows: (sql) => (sql.includes('FROM produtos') ? opts.catalogo ?? [] : opts.irmaos ?? []),
    });
  }

  it('recusa dois códigos manuais iguais no lote, apontando as duas posições', async () => {
    const { manager } = managerCom();

    await expect(assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-1', produto_id: null, codigo_manual: 'ABC' },
      { uuid: 'i-2', produto_id: null, codigo_manual: 'XYZ' },
      { uuid: 'i-3', produto_id: null, codigo_manual: 'ABC' },
    ], { substituiTodos: true })).rejects.toThrow(
      /Código ABC está repetido nos itens 1 e 3 do pedido/,
    );
  });

  it('recusa o mesmo produto duas vezes mesmo sem código manual', async () => {
    const { manager } = managerCom({
      catalogo: [{ id: 7, codigo: null, descricao: 'Cadeira' }],
    });

    await expect(assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-1', produto_id: 7, codigo_manual: null },
      { uuid: 'i-2', produto_id: 7, codigo_manual: null },
    ], { substituiTodos: true })).rejects.toThrow(ConflictException);
  });

  /**
   * O caso que índice nenhum pega: o código do produto vive em `produtos`, e
   * índice não cruza tabela. Só a resolução do catálogo aqui enxerga.
   */
  it('recusa código manual igual ao código de um produto do catálogo no mesmo pedido', async () => {
    const { manager } = managerCom({
      catalogo: [{ id: 7, codigo: 'ABC', descricao: 'Cadeira' }],
    });

    await expect(assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-1', produto_id: 7, codigo_manual: null },
      { uuid: 'i-2', produto_id: null, codigo_manual: 'ABC' },
    ], { substituiTodos: true })).rejects.toThrow(/Código ABC/);
  });

  it('aceita vários itens sem código, só com descrição manual', async () => {
    const { manager } = managerCom();

    await expect(assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-1', produto_id: null, codigo_manual: null },
      { uuid: 'i-2', produto_id: null, codigo_manual: '' },
    ], { substituiTodos: true })).resolves.toBeUndefined();
  });

  /**
   * `substituiTodos: true` é a porta REST, que manda a lista completa e apaga os
   * omitidos: consultar irmãos ali acusaria colisão com a própria linha que vai
   * sumir.
   */
  it('com substituiTodos não consulta irmãos gravados', async () => {
    const { manager, queries } = managerCom();

    await assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-1', produto_id: null, codigo_manual: 'ABC' },
    ], { substituiTodos: true });

    expect(queries.filter(({ sql }) => sql.includes('FROM itens_pedido'))).toEqual([]);
  });

  it('sem substituiTodos recusa colisão com irmão já gravado, sem citar posição', async () => {
    const { manager } = managerCom({
      irmaos: [{ produto_id: null, codigo_manual: 'ABC', produto_codigo: null, produto_descricao: null }],
    });

    await expect(assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-2', produto_id: null, codigo_manual: 'ABC' },
    ], { substituiTodos: false })).rejects.toThrow(
      'Código ABC já está em outro item deste pedido.',
    );
  });

  it('sem substituiTodos ignora o próprio item na consulta de irmãos', async () => {
    const { manager, queries } = managerCom();

    await assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-2', produto_id: null, codigo_manual: 'ABC' },
    ], { substituiTodos: false });

    const irmaos = queries.find(({ sql }) => sql.includes('FROM itens_pedido'));
    expect(irmaos?.sql).toContain('i.deleted_at IS NULL');
    expect(irmaos?.params).toEqual([TENANT, 10, ['i-2']]);
  });

  it('compara com trim: espaço em volta não cria código novo', async () => {
    const { manager } = managerCom();

    await expect(assertCodigosItensUnicos(manager, TENANT, 10, [
      { uuid: 'i-1', produto_id: null, codigo_manual: 'ABC' },
      { uuid: 'i-2', produto_id: null, codigo_manual: '  ABC  ' },
    ], { substituiTodos: true })).rejects.toThrow(ConflictException);
  });
});
