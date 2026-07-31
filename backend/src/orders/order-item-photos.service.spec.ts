import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { OrderItemPhotosService } from './order-item-photos.service';
import { RequestUser } from '../common/types/jwt-payload.type';

const admin: RequestUser = {
  sub: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  tenantId: 'tenant-a',
  tenantSubdomain: 'tenant-a',
  roles: ['ADMIN'],
  plan: 'pro',
  tokenVersion: 1,
  jti: 'jti-a',
};
const vendedor: RequestUser = { ...admin, roles: ['VENDEDOR'] };

const orderUuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const itemUuid = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function subject(options: { order?: unknown; itens?: Array<{ produto_id: number | null }> } = {}) {
  const builder: Record<string, jest.Mock> = {};
  for (const metodo of ['where', 'andWhere']) builder[metodo] = jest.fn().mockReturnValue(builder);
  builder.getOne = jest.fn().mockResolvedValue('order' in options ? options.order : { id: 7, uuid: orderUuid });

  const query = jest.fn().mockResolvedValue(options.itens ?? [{ produto_id: 42 }]);
  const orderRepo = {
    createQueryBuilder: jest.fn(() => builder),
    manager: { query },
  } as any;

  const photosService = {
    contentByProductId: jest.fn().mockResolvedValue({
      buffer: PNG, mimeType: 'image/png', nomeArquivo: 'p.png',
    }),
  } as any;

  return { service: new OrderItemPhotosService(orderRepo, photosService), builder, query, photosService };
}

describe('OrderItemPhotosService#content', () => {
  it('serve a foto do produto do item', async () => {
    const { service, photosService } = subject();

    await expect(service.content(orderUuid, itemUuid, admin)).resolves.toEqual({
      buffer: PNG, mimeType: 'image/png', nomeArquivo: 'p.png',
    });
    expect(photosService.contentByProductId).toHaveBeenCalledWith(42, admin.tenantId);
  });

  /**
   * O recorte é o que impede `pedidos.ver` de virar licença para varrer o
   * catálogo: o item tem que ser DESTE pedido.
   */
  it('restringe a consulta ao pedido da rota', async () => {
    const { service, query } = subject();

    await service.content(orderUuid, itemUuid, admin);

    expect(query.mock.calls[0][1]).toEqual([itemUuid, 7, admin.tenantId]);
    expect(query.mock.calls[0][0]).toContain('deleted_at IS NULL');
  });

  // Pedido de outro vendedor devolve 404, nunca 403: não vazar existência é a
  // mesma regra do `OrdersService`.
  it('404 quando o pedido não é do vendedor', async () => {
    const { service, photosService } = subject({ order: null });

    await expect(service.content(orderUuid, itemUuid, vendedor))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(photosService.contentByProductId).not.toHaveBeenCalled();
  });

  it('aplica ownership de vendedor na busca do pedido', async () => {
    const { service, builder } = subject();

    await service.content(orderUuid, itemUuid, vendedor);

    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('vendedor_id'),
      expect.objectContaining({ sub: vendedor.sub }),
    );
  });

  it('não filtra por vendedor quando o usuário tem outra role', async () => {
    const { service, builder } = subject();

    await service.content(orderUuid, itemUuid, admin);

    expect(builder.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('vendedor_id'),
      expect.anything(),
    );
  });

  // Item manual não tem produto de onde puxar foto — o papel imprime a célula
  // vazia e o front trata o 404 como "sem foto".
  it('404 no item manual, sem produto', async () => {
    const { service, photosService } = subject({ itens: [{ produto_id: null }] });

    await expect(service.content(orderUuid, itemUuid, admin))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(photosService.contentByProductId).not.toHaveBeenCalled();
  });

  it('404 quando o item não é do pedido', async () => {
    const { service } = subject({ itens: [] });

    await expect(service.content(orderUuid, itemUuid, admin))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
