import 'reflect-metadata';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  MAX_PHOTOS_PER_ORDER,
  OrderPhotosService,
  normalizePhotoCode,
} from './order-photos.service';
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

const vendedorA: RequestUser = { ...admin, roles: ['VENDEDOR'] };

const orderUuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.from([0x00]),
]);

function fileFrom(buffer: Buffer, originalname: string): Express.Multer.File {
  return { buffer, originalname, size: buffer.length } as Express.Multer.File;
}

function orderQueryBuilder(order: unknown) {
  const builder: Record<string, jest.Mock> = {};
  for (const method of ['where', 'andWhere', 'leftJoin', 'addSelect', 'orderBy']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  builder.getOne = jest.fn().mockResolvedValue(order);
  builder.getMany = jest.fn().mockResolvedValue([]);
  return builder;
}

/**
 * `photoRepo` precisa de `manager.query` (auto-vínculo e resolução de item),
 * `count` (teto por pedido) e `create`/`save`.
 */
function photoRepoMock(options: { itens?: Array<{ id: number }>; count?: number } = {}) {
  const query = jest.fn().mockResolvedValue(options.itens ?? []);
  return {
    manager: { query },
    count: jest.fn().mockResolvedValue(options.count ?? 0),
    create: jest.fn((values: Record<string, unknown>) => ({ ...values })),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, uuid: 'foto-uuid', version: 1, created_at: new Date() })),
    createQueryBuilder: jest.fn(),
  } as any;
}

function serviceWith(photoRepo: any, order: unknown) {
  const orderRepo = { createQueryBuilder: jest.fn().mockReturnValue(orderQueryBuilder(order)) } as any;
  return { service: new OrderPhotosService(photoRepo, orderRepo), orderRepo };
}

const pedidoEmAberto = { id: 7, uuid: orderUuid, status: 'em_aberto' };

describe('normalizePhotoCode', () => {
  it.each([
    ['ABC-123.jpg', 'ABC-123'],
    ['abc-123.JPEG', 'ABC-123'],
    ['  abc-123 .png', 'ABC-123'],
    ['/tmp/uploads/ABC-123.webp', 'ABC-123'],
    // Sufixo de cópia do SO: o usuário fotografa o mesmo código duas vezes e o
    // segundo arquivo não pode deixar de vincular por causa do sufixo.
    ['ABC-123 (1).jpg', 'ABC-123'],
    ['ABC-123(2).jpg', 'ABC-123'],
  ])('normaliza %s para %s', (entrada, esperado) => {
    expect(normalizePhotoCode(entrada)).toBe(esperado);
  });

  // Guarda de regressão: uma versão anterior removia sufixo `-1`/`_2` e comia
  // o final de códigos legítimos, vinculando a foto ao item errado.
  it.each(['ABC-123.jpg', 'PECA_2.png', 'X-9.webp'])(
    'preserva o sufixo numérico de %s (é parte do código, não cópia)',
    (entrada) => {
      expect(normalizePhotoCode(entrada)).toBe(entrada.replace(/\.[a-z]+$/, '').toUpperCase());
    },
  );
});

describe('OrderPhotosService.upload', () => {
  it('vincula ao item quando o nome do arquivo bate com exatamente um código', async () => {
    const photoRepo = photoRepoMock({ itens: [{ id: 42 }] });
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    photoRepo.manager.query
      .mockResolvedValueOnce([{ id: 42 }])          // autoLinkItem
      .mockResolvedValueOnce([{ uuid: 'item-uuid' }]); // itemUuidById

    const result = await service.upload(orderUuid, fileFrom(JPEG, 'ABC-123.jpg'), undefined, admin);

    expect(result.vinculado).toBe(true);
    expect(result.item_uuid).toBe('item-uuid');
    expect(result.codigo_vinculo).toBe('ABC-123');
    expect(photoRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      item_pedido_id: 42, mime_type: 'image/jpeg', storage_backend: 'db',
    }));
  });

  it('não vincula quando o código bate com mais de um item (vínculo seria chute)', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    photoRepo.manager.query.mockResolvedValueOnce([{ id: 42 }, { id: 43 }]);

    const result = await service.upload(orderUuid, fileFrom(JPEG, 'ABC-123.jpg'), undefined, admin);

    expect(result.vinculado).toBe(false);
    expect(photoRepo.create).toHaveBeenCalledWith(expect.objectContaining({ item_pedido_id: null }));
  });

  it('não vincula quando nenhum item bate', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    photoRepo.manager.query.mockResolvedValueOnce([]);

    const result = await service.upload(orderUuid, fileFrom(PNG, 'foto-aleatoria.png'), undefined, admin);

    expect(result.vinculado).toBe(false);
    expect(result.mime_type).toBe('image/png');
  });

  it('aceita webp', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    photoRepo.manager.query.mockResolvedValueOnce([]);

    await expect(service.upload(orderUuid, fileFrom(WEBP, 'x.webp'), undefined, admin))
      .resolves.toMatchObject({ mime_type: 'image/webp' });
  });

  // O `mimetype` do multipart é escolhido pelo cliente: um executável
  // renomeado para .jpg chega como image/jpeg. Só o conteúdo decide.
  it('rejeita arquivo que não é imagem, mesmo com nome e mimetype de imagem', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    const naoImagem = Buffer.from('<?php system($_GET["c"]); ?>', 'utf8');

    await expect(
      service.upload(orderUuid, fileFrom(naoImagem, 'inocente.jpg'), undefined, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(photoRepo.save).not.toHaveBeenCalled();
  });

  it('rejeita SVG (XML executável — vetor de XSS)', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', 'utf8');

    await expect(
      service.upload(orderUuid, fileFrom(svg, 'logo.svg'), undefined, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejeita corpo vazio', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);

    await expect(service.upload(orderUuid, undefined, undefined, admin))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloqueia upload em pedido já liberado', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, { ...pedidoEmAberto, status: 'liberado' });

    await expect(service.upload(orderUuid, fileFrom(JPEG, 'a.jpg'), undefined, admin))
      .rejects.toBeInstanceOf(ConflictException);
    expect(photoRepo.save).not.toHaveBeenCalled();
  });

  it('bloqueia acima do teto de fotos por pedido', async () => {
    const photoRepo = photoRepoMock({ count: MAX_PHOTOS_PER_ORDER });
    const { service } = serviceWith(photoRepo, pedidoEmAberto);

    await expect(service.upload(orderUuid, fileFrom(JPEG, 'a.jpg'), undefined, admin))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita item_uuid que não pertence ao pedido', async () => {
    const photoRepo = photoRepoMock();
    const { service } = serviceWith(photoRepo, pedidoEmAberto);
    photoRepo.manager.query.mockResolvedValueOnce([]); // resolveItemId não acha

    await expect(
      service.upload(orderUuid, fileFrom(JPEG, 'a.jpg'), 'item-de-outro-pedido', admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // Isolamento: o pedido é carregado com tenant + ownership antes de tudo.
  it('retorna 404 quando o pedido é de outro vendedor', async () => {
    const photoRepo = photoRepoMock();
    const { service, orderRepo } = serviceWith(photoRepo, undefined);

    await expect(service.upload(orderUuid, fileFrom(JPEG, 'a.jpg'), undefined, vendedorA))
      .rejects.toBeInstanceOf(NotFoundException);

    const builder = orderRepo.createQueryBuilder.mock.results[0].value;
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('o.vendedor_id ='),
      { sub: vendedorA.sub, tenantId: vendedorA.tenantId },
    );
  });

  it('não filtra por vendedor para quem não é exclusivamente VENDEDOR', async () => {
    const photoRepo = photoRepoMock();
    const { service, orderRepo } = serviceWith(photoRepo, pedidoEmAberto);
    photoRepo.manager.query.mockResolvedValueOnce([]);

    await service.upload(orderUuid, fileFrom(JPEG, 'a.jpg'), undefined, admin);

    const builder = orderRepo.createQueryBuilder.mock.results[0].value;
    expect(builder.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('vendedor_id'),
      expect.anything(),
    );
  });
});

describe('OrderPhotosService.content', () => {
  it('retorna 404 quando a foto não existe no pedido', async () => {
    const photoRepo = photoRepoMock();
    const contentBuilder: Record<string, jest.Mock> = {};
    for (const method of ['addSelect', 'where', 'andWhere']) {
      contentBuilder[method] = jest.fn().mockReturnValue(contentBuilder);
    }
    contentBuilder.getOne = jest.fn().mockResolvedValue(undefined);
    photoRepo.createQueryBuilder = jest.fn().mockReturnValue(contentBuilder);
    const { service } = serviceWith(photoRepo, pedidoEmAberto);

    await expect(service.content(orderUuid, 'foto-x', admin)).rejects.toBeInstanceOf(NotFoundException);
  });
});
