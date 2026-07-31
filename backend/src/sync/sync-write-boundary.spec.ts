import 'reflect-metadata';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { SyncEntity, SyncOperation } from './dto/sync.dto';
import { SYNC_ENTITY_POLICIES } from './sync-entity-policy';
import { OrdersSyncWriter } from './writers/orders-sync.writer';
import { SyncService } from './sync.service';

/**
 * A invariante que PROB-0065 comprou: PEDIDO TEM UMA PORTA DE ESCRITA SÓ.
 *
 * O defeito não foi um campo esquecido na allowlist — foi existir um segundo
 * caminho de escrita, com aritmética e regras próprias, que ninguém lembrava de
 * atualizar quando a máquina de estados ou o arredondamento mudavam. Um teste
 * que só cobrisse "`status` é recusado" não impediria a próxima porta.
 *
 * Três camadas, da mais forte para a mais fraca:
 *   1. estrutural — a policy DECLARA quem escreve cada entidade;
 *   2. comportamental — toda operação de pedido passa pelo `OrdersSyncWriter`;
 *   3. varredura de fonte — rede de segurança contra SQL literal em pedido
 *      escrito fora dos módulos donos do assunto.
 */

describe('Fronteira de escrita do sync — declaração na policy', () => {
  it('pedido e item de pedido são escritos pela porta de pedido; o resto é genérico', () => {
    expect(SYNC_ENTITY_POLICIES[SyncEntity.PEDIDOS].writer).toBe('orders');
    expect(SYNC_ENTITY_POLICIES[SyncEntity.ITENS_PEDIDO].writer).toBe('orders');

    const genericas = Object.values(SyncEntity)
      .filter((entity) => entity !== SyncEntity.PEDIDOS && entity !== SyncEntity.ITENS_PEDIDO);
    for (const entity of genericas) {
      expect(SYNC_ENTITY_POLICIES[entity].writer).toBe('generic');
    }
  });

  it.each(Object.entries(SYNC_ENTITY_POLICIES))(
    '%s não classifica o mesmo campo em duas categorias',
    (_entity, policy) => {
      const derivados = new Set<string>(policy.derivedFields);
      for (const campo of policy.writableFields) expect(derivados.has(campo)).toBe(false);
      for (const campo of policy.serverControlledFields) expect(derivados.has(campo)).toBe(false);
    },
  );

  // `status` e os totais saíram da entrada para TODA origem — não só para a
  // externa, como era até PROB-0074.
  it('pedido não aceita status nem totais como entrada, em nenhuma origem', () => {
    const policy = SYNC_ENTITY_POLICIES[SyncEntity.PEDIDOS];
    expect(policy.writableFields).not.toContain('status');
    expect(policy.serverControlledFields).toContain('status');
    expect(policy.derivedFields).toEqual(
      expect.arrayContaining(['total_sem_imposto', 'total_com_imposto']),
    );
  });

  it('item de pedido aceita os insumos e recusa os derivados', () => {
    const policy = SYNC_ENTITY_POLICIES[SyncEntity.ITENS_PEDIDO];
    expect(policy.writableFields).toEqual(expect.arrayContaining([
      'qtd_caixas', 'qtd_unitaria', 'preco_unitario', 'desconto_perc', 'ipi_perc',
    ]));
    expect(policy.derivedFields).toEqual(expect.arrayContaining([
      'total_item', 'qtd_total', 'valor_com_desconto', 'valor_com_imposto', 'total_com_imposto',
    ]));
  });
});

describe('Fronteira de escrita do sync — o push passa pela porta', () => {
  const UUID_PEDIDO = '7f9a9e95-78fb-41f8-83c9-108ddab00962';
  const UUID_ITEM = 'c1a2b3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

  function makeService() {
    const writer = new OrdersSyncWriter();
    jest.spyOn(writer, 'assertPedidoEditavel').mockResolvedValue({ id: 1 } as never);
    jest.spyOn(writer, 'assertPedidoRemovivel').mockResolvedValue({ id: 1 } as never);
    jest.spyOn(writer, 'writeItem').mockResolvedValue({ id: 7, pedidoId: 1 });
    jest.spyOn(writer, 'deleteItem').mockResolvedValue({ pedidoId: 1 });

    const query = jest.fn().mockResolvedValue([{ id: 1, updated_at: '2020-01-01T00:00:00.000Z' }]);
    const queryRunner = {
      connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(),
      manager: { getRepository: () => ({}), query },
      query,
    };
    const service = new SyncService({ createQueryRunner: () => queryRunner } as never, writer);
    return { service, writer };
  }

  it('UPDATE de pedido não escreve sem passar pela guarda de estado', async () => {
    const { service, writer } = makeService();
    await service.pushItems(
      [{
        uuid: UUID_PEDIDO, entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.UPDATE, payload: { observacao: 'x' },
      }],
      'tenant-1',
    );
    expect(writer.assertPedidoEditavel).toHaveBeenCalled();
  });

  it('DELETE de pedido não escreve sem passar pela guarda de nota fiscal', async () => {
    const { service, writer } = makeService();
    await service.pushItems(
      [{
        uuid: UUID_PEDIDO, entity: SyncEntity.PEDIDOS,
        operation: SyncOperation.DELETE, payload: {},
      }],
      'tenant-1',
    );
    expect(writer.assertPedidoRemovivel).toHaveBeenCalled();
  });

  it.each([SyncOperation.CREATE, SyncOperation.UPDATE])(
    'item de pedido em %s vai pela porta de pedido, nunca por SQL montado aqui',
    async (operation) => {
      const { service, writer } = makeService();
      await service.pushItems(
        [{
          uuid: UUID_ITEM, entity: SyncEntity.ITENS_PEDIDO, operation,
          payload: { pedido_uuid: UUID_PEDIDO, qtd_caixas: 1, qtd_unitaria: 1, preco_unitario: '10' },
        }],
        'tenant-1',
      );
      expect(writer.writeItem).toHaveBeenCalled();
    },
  );

  it('DELETE de item vai pela porta de pedido (recalcula o cabeçalho)', async () => {
    const { service, writer } = makeService();
    await service.pushItems(
      [{
        uuid: UUID_ITEM, entity: SyncEntity.ITENS_PEDIDO,
        operation: SyncOperation.DELETE, payload: {},
      }],
      'tenant-1',
    );
    expect(writer.deleteItem).toHaveBeenCalled();
  });
});

describe('Fronteira de escrita do sync — varredura de fonte', () => {
  /**
   * Rede de segurança, não a guarda principal: é grep, e um autor determinado
   * escapa. O que ela pega é o caso real — alguém com pressa escrevendo
   * `UPDATE pedidos SET ...` num módulo novo, sem saber que existe
   * `orders/order-write.ts`.
   */
  const RAIZ = resolve(__dirname, '..');
  const DIRETORIOS_DONOS = ['orders', 'faturamento', 'database'];
  const ESCRITA_LITERAL = /\b(INSERT\s+INTO|UPDATE)\s+(pedidos|itens_pedido)\b/i;

  function listarFontes(dir: string): string[] {
    return readdirSync(dir).flatMap((entrada) => {
      const caminho = join(dir, entrada);
      if (statSync(caminho).isDirectory()) return listarFontes(caminho);
      return caminho.endsWith('.ts') && !caminho.endsWith('.spec.ts') ? [caminho] : [];
    });
  }

  it('nenhum módulo fora de orders/faturamento/database escreve em pedido por SQL literal', () => {
    const violacoes = listarFontes(RAIZ)
      .filter((arquivo) => {
        const relativo = relative(RAIZ, arquivo);
        if (DIRETORIOS_DONOS.some((dono) => relativo.startsWith(`${dono}/`))) return false;
        return ESCRITA_LITERAL.test(readFileSync(arquivo, 'utf8'));
      })
      .map((arquivo) => relative(RAIZ, arquivo));

    // `sync.service.ts` monta o SQL genérico com o nome da tabela vindo da
    // policy, então não casa com o literal — e o caminho de pedido nem chega lá.
    expect(violacoes).toEqual([]);
  });
});
