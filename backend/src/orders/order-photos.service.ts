import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderPhoto } from './entities/order-photo.entity';
import { RequestUser } from '../common/types/jwt-payload.type';
import { optimisticSoftDelete } from '../common/persistence/optimistic-concurrency';
import { isVendorOnly, vendorOwnershipWhere } from './order-ownership';

/** Teto por foto. Espelha o CHECK `pedido_fotos_tamanho_bytes_check` (0034). */
export const MAX_PHOTO_SIZE_BYTES = 3 * 1024 * 1024;

/** Teto por pedido — evita que um upload em lote infle a tabela sem limite. */
export const MAX_PHOTOS_PER_ORDER = 10;

/**
 * Assinaturas de arquivo (magic bytes) dos formatos aceitos.
 *
 * O `mimetype` do multipart é escolhido pelo cliente e não prova nada: um
 * `.php` renomeado para `.jpg` chega como `image/jpeg`. Só o conteúdo decide.
 */
const MAGIC_BYTES: Array<{ mime: string; matches: (buffer: Buffer) => boolean }> = [
  { mime: 'image/jpeg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    matches: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/** Metadados de foto — nunca inclui os bytes. */
export type OrderPhotoMetadata = {
  uuid: string;
  version: number;
  nome_arquivo: string;
  mime_type: string;
  tamanho_bytes: number;
  codigo_vinculo: string | null;
  item_uuid: string | null;
  vinculado: boolean;
  created_at: Date;
};

export type OrderPhotoContent = { buffer: Buffer; mimeType: string; nomeArquivo: string };

/**
 * Normaliza o nome do arquivo para comparar com o código do item.
 *
 * Remove diretório, extensão e o sufixo `(n)` que o sistema operacional
 * acrescenta em cópias — o usuário fotografa o mesmo código duas vezes e o
 * segundo arquivo não pode deixar de vincular por causa do sufixo.
 *
 * Sufixos `-1`/`_2` NÃO são removidos de propósito: são indistinguíveis de um
 * código real (`ABC-123` viraria `ABC`), e vincular a foto ao item errado é
 * pior do que não vincular — o usuário corrige um "não vinculado" na tela,
 * mas não percebe um vínculo silenciosamente errado.
 */
export function normalizePhotoCode(nomeArquivo: string): string {
  const semDiretorio = nomeArquivo.split(/[\\/]/).pop() ?? nomeArquivo;
  const semExtensao = semDiretorio.replace(/\.[a-z0-9]+$/i, '');
  return semExtensao
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim()
    .toUpperCase();
}

@Injectable()
export class OrderPhotosService {
  constructor(
    @InjectRepository(OrderPhoto) private readonly photoRepo: Repository<OrderPhoto>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  /**
   * Carrega o pedido aplicando tenant e ownership de vendedor. Retorna 404
   * (nunca 403) quando o pedido é de outro vendedor — não vazar existência é
   * a mesma regra do `OrdersService`.
   */
  private async loadOrder(uuid: string, user: RequestUser): Promise<Order> {
    const qb = this.orderRepo.createQueryBuilder('o')
      .where('o.uuid = :uuid', { uuid })
      .andWhere('o.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('o.deleted_at IS NULL');
    if (isVendorOnly(user)) {
      const { sql, params } = vendorOwnershipWhere(user, 'o');
      qb.andWhere(sql, params);
    }
    const order = await qb.getOne();
    if (!order) throw new NotFoundException(`Pedido ${uuid} não encontrado.`);
    return order;
  }

  private detectMimeType(buffer: Buffer): string {
    const detected = MAGIC_BYTES.find((entry) => entry.matches(buffer));
    if (!detected) {
      throw new BadRequestException('Arquivo não é uma imagem JPEG, PNG ou WEBP válida.');
    }
    return detected.mime;
  }

  /**
   * Vincula a foto ao item cujo código bate com o nome do arquivo.
   *
   * Só vincula em match ÚNICO: se dois itens do pedido têm o mesmo código, o
   * vínculo seria um chute — a foto fica no pedido e o usuário escolhe o item
   * na tela. Compara contra `codigo_manual` e contra o código do produto.
   */
  private async autoLinkItem(
    orderId: number,
    tenantId: string,
    codigo: string,
  ): Promise<number | null> {
    if (!codigo) return null;
    const rows = await this.photoRepo.manager.query(
      `SELECT i.id
         FROM itens_pedido i
         LEFT JOIN produtos p ON p.id = i.produto_id AND p.tenant_id = i.tenant_id
        WHERE i.pedido_id = $1
          AND i.tenant_id = $2
          AND i.deleted_at IS NULL
          AND (UPPER(TRIM(i.codigo_manual)) = $3 OR UPPER(TRIM(p.codigo)) = $3)`,
      [orderId, tenantId, codigo],
    ) as Array<{ id: number }>;
    return rows.length === 1 ? rows[0].id : null;
  }

  private async resolveItemId(orderId: number, tenantId: string, itemUuid: string): Promise<number> {
    const rows = await this.photoRepo.manager.query(
      `SELECT id FROM itens_pedido WHERE uuid = $1 AND pedido_id = $2 AND tenant_id = $3 AND deleted_at IS NULL`,
      [itemUuid, orderId, tenantId],
    ) as Array<{ id: number }>;
    if (!rows[0]) throw new BadRequestException('Item informado não pertence a este pedido.');
    return rows[0].id;
  }

  private toMetadata(photo: OrderPhoto, itemUuid: string | null): OrderPhotoMetadata {
    return {
      uuid: photo.uuid,
      version: photo.version,
      nome_arquivo: photo.nome_arquivo,
      mime_type: photo.mime_type,
      tamanho_bytes: photo.tamanho_bytes,
      codigo_vinculo: photo.codigo_vinculo,
      item_uuid: itemUuid,
      vinculado: itemUuid != null,
      created_at: photo.created_at,
    };
  }

  async upload(
    orderUuid: string,
    file: Express.Multer.File | undefined,
    itemUuid: string | undefined,
    user: RequestUser,
  ): Promise<OrderPhotoMetadata> {
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo de imagem no campo `arquivo`.');
    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      throw new BadRequestException('Imagem maior que 3 MB.');
    }

    const order = await this.loadOrder(orderUuid, user);
    // Mesma regra do PUT: pedido liberado não é mais editável. Sem isto, dava
    // para trocar as fotos de um pedido já faturado.
    if (order.status !== 'em_aberto') {
      throw new ConflictException('Pedido já liberado — não é possível anexar fotos.');
    }

    const existentes = await this.photoRepo.count({
      where: { pedido_id: order.id, tenant_id: user.tenantId, deleted_at: IsNull() },
    });
    if (existentes >= MAX_PHOTOS_PER_ORDER) {
      throw new ConflictException(`Limite de ${MAX_PHOTOS_PER_ORDER} fotos por pedido atingido.`);
    }

    const mimeType = this.detectMimeType(file.buffer);
    const codigo = normalizePhotoCode(file.originalname ?? '');
    const itemId = itemUuid
      ? await this.resolveItemId(order.id, user.tenantId, itemUuid)
      : await this.autoLinkItem(order.id, user.tenantId, codigo);

    const saved = await this.photoRepo.save(this.photoRepo.create({
      tenant_id: user.tenantId,
      pedido_id: order.id,
      item_pedido_id: itemId,
      nome_arquivo: file.originalname ?? 'foto',
      codigo_vinculo: codigo || null,
      mime_type: mimeType,
      tamanho_bytes: file.buffer.length,
      storage_backend: 'db',
      conteudo: file.buffer,
      storage_key: null,
    }));

    return this.toMetadata(saved, itemId ? await this.itemUuidById(itemId, user.tenantId) : null);
  }

  private async itemUuidById(itemId: number, tenantId: string): Promise<string | null> {
    const rows = await this.photoRepo.manager.query(
      'SELECT uuid FROM itens_pedido WHERE id = $1 AND tenant_id = $2',
      [itemId, tenantId],
    ) as Array<{ uuid: string }>;
    return rows[0]?.uuid ?? null;
  }

  /** Metadados das fotos do pedido — sem os bytes (`conteudo` é `select: false`). */
  async list(orderUuid: string, user: RequestUser): Promise<OrderPhotoMetadata[]> {
    const order = await this.loadOrder(orderUuid, user);
    const photos = await this.photoRepo.createQueryBuilder('f')
      .leftJoin('f.item', 'item')
      .addSelect('item.uuid')
      .where('f.pedido_id = :pedidoId', { pedidoId: order.id })
      .andWhere('f.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('f.deleted_at IS NULL')
      .orderBy('f.created_at', 'ASC')
      .getMany();

    return photos.map((photo) => this.toMetadata(photo, photo.item?.uuid ?? null));
  }

  async content(orderUuid: string, photoUuid: string, user: RequestUser): Promise<OrderPhotoContent> {
    const order = await this.loadOrder(orderUuid, user);
    const photo = await this.photoRepo.createQueryBuilder('f')
      .addSelect('f.conteudo')
      .where('f.uuid = :uuid', { uuid: photoUuid })
      .andWhere('f.pedido_id = :pedidoId', { pedidoId: order.id })
      .andWhere('f.tenant_id = :tenantId', { tenantId: user.tenantId })
      .andWhere('f.deleted_at IS NULL')
      .getOne();

    if (!photo?.conteudo) throw new NotFoundException(`Foto ${photoUuid} não encontrada.`);
    return { buffer: photo.conteudo, mimeType: photo.mime_type, nomeArquivo: photo.nome_arquivo };
  }

  async remove(orderUuid: string, photoUuid: string, version: number, user: RequestUser): Promise<void> {
    // `loadOrder` já aplica tenant e ownership: sem ele um vendedor apagaria a
    // foto de um pedido que nem enxerga.
    await this.loadOrder(orderUuid, user);
    await optimisticSoftDelete({
      repository: this.photoRepo,
      uuid: photoUuid,
      tenantId: user.tenantId,
      expectedVersion: version,
      resource: 'order-photo',
      notFoundMessage: `Foto ${photoUuid} não encontrada.`,
    });
  }
}
