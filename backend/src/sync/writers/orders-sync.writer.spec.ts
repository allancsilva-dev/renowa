import { BadRequestException } from '@nestjs/common';
import { SyncOperation } from '../dto/sync.dto';
import { OrdersSyncWriter } from './orders-sync.writer';

/**
 * A porta de escrita de pedido no sync. O que estes casos protegem é o que
 * PROB-0065 descreve: o push escrevia `total_item` como se fosse entrada, não
 * recalculava o cabeçalho, e mexia em item de pedido já faturado.
 */

type Linha = Record<string, unknown>;

const PEDIDO_ABERTO: Linha = {
  id: 1, uuid: 'p-1', tenant_id: 't-1', status: 'em_aberto', origem: 'interno',
  deleted_at: null, fornecedor_id: 5, total_sem_imposto: '0.00', total_com_imposto: '0.00',
};

function harness(opts: {
  pedido?: Linha | null;
  itemAtual?: Linha | null;
  itensDoPedido?: Linha[];
  queryPorSql?: (sql: string) => unknown;
} = {}) {
  const salvosItem: Linha[] = [];
  const queries: Array<{ sql: string; params?: unknown[] }> = [];

  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(opts.pedido === undefined ? PEDIDO_ABERTO : opts.pedido),
    findOneOrFail: jest.fn().mockResolvedValue(opts.pedido === undefined ? PEDIDO_ABERTO : (opts.pedido ?? {})),
    save: jest.fn(async (row: Linha) => row),
  };
  const itemRepo = {
    find: jest.fn().mockResolvedValue(opts.itensDoPedido ?? []),
    findOne: jest.fn().mockResolvedValue(opts.itemAtual ?? null),
    create: (row: Linha) => row,
    save: jest.fn(async (row: Linha) => {
      salvosItem.push(row);
      return { ...row, id: 77 };
    }),
  };

  const manager = {
    getRepository: (entity: { name: string }) => (entity.name === 'Order' ? orderRepo : itemRepo),
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      return opts.queryPorSql ? opts.queryPorSql(sql) : [];
    }),
  } as never;

  return { writer: new OrdersSyncWriter(), manager, salvosItem, queries, itemRepo, orderRepo };
}

describe('OrdersSyncWriter — item de pedido', () => {
  it('deriva os cinco campos que a allowlist antiga não tinha e recalcula o cabeçalho', async () => {
    const h = harness({
      queryPorSql: (sql) => (sql.includes('FROM produtos') ? [{ id: 9, fornecedor_id: 5 }] : []),
      itensDoPedido: [],
    });

    await h.writer.writeItem(
      h.manager, SyncOperation.CREATE, 'i-1',
      {
        pedido_uuid: 'p-1', produto_uuid: 'prod-1',
        qtd_caixas: 2, qtd_unitaria: 4, preco_unitario: '25.50', desconto_perc: 10, ipi_perc: 10,
      },
      't-1',
    );

    expect(h.salvosItem[0]).toMatchObject({
      qtd_total: '8.000',
      valor_com_desconto: '22.95',
      valor_com_imposto: '25.25',
      total_item: '183.60',
      total_com_imposto: '201.96',
    });
    // O cabeçalho é recalculado na MESMA transação — sem isso o pedido fica com
    // total que não bate com item nenhum.
    expect(h.itemRepo.find).toHaveBeenCalled();
  });

  it.each(['liberado', 'parcialmente_faturado', 'faturado', 'cancelado'])(
    'recusa escrever item em pedido %s',
    async (status) => {
      const h = harness({ pedido: { ...PEDIDO_ABERTO, status } });

      await expect(h.writer.writeItem(
        h.manager, SyncOperation.CREATE, 'i-1',
        { pedido_uuid: 'p-1', descricao_manual: 'x', qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '1' },
        't-1',
      )).rejects.toThrow(BadRequestException);

      expect(h.salvosItem).toHaveLength(0);
    },
  );

  it('recusa item em pedido de origem externa — pedido externo não tem itens', async () => {
    const h = harness({ pedido: { ...PEDIDO_ABERTO, origem: 'externo' } });

    await expect(h.writer.writeItem(
      h.manager, SyncOperation.CREATE, 'i-1',
      { pedido_uuid: 'p-1', descricao_manual: 'x' },
      't-1',
    )).rejects.toThrow(BadRequestException);
  });

  it('exige pedido_uuid no CREATE', async () => {
    const h = harness();
    await expect(h.writer.writeItem(
      h.manager, SyncOperation.CREATE, 'i-1', { descricao_manual: 'x' }, 't-1',
    )).rejects.toThrow(/pedido_uuid é obrigatório/);
  });

  it('recusa trocar o pedido do item no UPDATE', async () => {
    const h = harness();
    await expect(h.writer.writeItem(
      h.manager, SyncOperation.UPDATE, 'i-1', { pedido_uuid: 'p-2' }, 't-1',
    )).rejects.toThrow(/não pode ser alterado/);
  });

  describe('resolução de ipi_perc — payload esparso não pode zerar imposto', () => {
    it('usa o valor enviado', async () => {
      const h = harness({
        queryPorSql: (sql) => (sql.includes('FROM produtos') ? [{ id: 9, fornecedor_id: 5 }] : []),
      });
      await h.writer.writeItem(
        h.manager, SyncOperation.CREATE, 'i-1',
        { pedido_uuid: 'p-1', produto_uuid: 'prod-1', qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '100', ipi_perc: 5 },
        't-1',
      );
      expect(h.salvosItem[0]).toMatchObject({ ipi_perc: '5.00', total_com_imposto: '105.00' });
    });

    it('preserva o valor gravado quando o UPDATE não manda ipi_perc', async () => {
      const h = harness({
        itemAtual: {
          id: 3, uuid: 'i-1', tenant_id: 't-1', produto_id: null, ipi_perc: '12.00',
          codigo_manual: null, descricao_manual: 'Item', qtd_caixas: '1.000',
          qtd_unitaria: '1.000', preco_unitario: '100.0000', desconto_perc: '0.00',
        },
        queryPorSql: (sql) => (sql.includes('JOIN pedidos') ? [{ uuid: 'p-1' }] : []),
      });

      await h.writer.writeItem(h.manager, SyncOperation.UPDATE, 'i-1', { qtd_caixas: 2 }, 't-1');

      expect(h.salvosItem[0]).toMatchObject({ ipi_perc: '12.00' });
    });

    it('cai no default do produto no CREATE sem ipi_perc', async () => {
      const h = harness({
        queryPorSql: (sql) => {
          if (sql.includes('SELECT ipi_perc FROM produtos')) return [{ ipi_perc: '8.00' }];
          if (sql.includes('FROM produtos')) return [{ id: 9, fornecedor_id: 5 }];
          return [];
        },
      });

      await h.writer.writeItem(
        h.manager, SyncOperation.CREATE, 'i-1',
        { pedido_uuid: 'p-1', produto_uuid: 'prod-1', qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '100' },
        't-1',
      );

      expect(h.salvosItem[0]).toMatchObject({ ipi_perc: '8.00', total_com_imposto: '108.00' });
    });

    it('fica nulo em item manual sem ipi_perc', async () => {
      const h = harness();
      await h.writer.writeItem(
        h.manager, SyncOperation.CREATE, 'i-1',
        { pedido_uuid: 'p-1', descricao_manual: 'Avulso', qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '100' },
        't-1',
      );
      expect(h.salvosItem[0]).toMatchObject({ ipi_perc: null });
    });
  });

  it('DELETE de item marca deleted_at e recalcula o cabeçalho', async () => {
    const h = harness({
      queryPorSql: (sql) => (sql.includes('JOIN pedidos') ? [{ uuid: 'p-1' }] : []),
    });

    await h.writer.deleteItem(h.manager, 'i-1', 't-1');

    const del = h.queries.find((q) => /UPDATE itens_pedido SET deleted_at/.test(q.sql));
    expect(del).toBeDefined();
    expect(del?.sql).toContain('version = version + 1');
    expect(h.itemRepo.find).toHaveBeenCalled();
  });
});

describe('OrdersSyncWriter — pedido', () => {
  it('assertPedidoEditavel recusa fora de em_aberto, em qualquer origem', async () => {
    for (const origem of ['interno', 'externo']) {
      const h = harness({ pedido: { ...PEDIDO_ABERTO, origem, status: 'faturado' } });
      await expect(h.writer.assertPedidoEditavel(h.manager, 'p-1', 't-1'))
        .rejects.toThrow(BadRequestException);
    }
  });

  it('assertPedidoRemovivel recusa pedido com nota fiscal ativa', async () => {
    const h = harness({ queryPorSql: () => [{ total: 1 }] });
    await expect(h.writer.assertPedidoRemovivel(h.manager, 'p-1', 't-1'))
      .rejects.toThrow(/notas fiscais ativas/);
  });

  it('assertPedidoRemovivel aceita pedido sem nota — inclusive fora de em_aberto', async () => {
    // Paridade exata com `OrdersService.remove`, que não tem gate de status.
    const h = harness({
      pedido: { ...PEDIDO_ABERTO, status: 'cancelado' },
      queryPorSql: () => [{ total: 0 }],
    });
    await expect(h.writer.assertPedidoRemovivel(h.manager, 'p-1', 't-1')).resolves.toBeDefined();
  });
});
