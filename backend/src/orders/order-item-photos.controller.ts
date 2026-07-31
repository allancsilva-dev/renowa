import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { OrderItemPhotosService } from './order-item-photos.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

/**
 * Foto que vai na linha do item no papel do pedido.
 *
 * A imagem é do PRODUTO do catálogo, mas esta rota existe sob `/pedidos` de
 * propósito: `PermissionGuard` combina permissões com AND e não tem OR, então
 * quem tem `pedidos.ver` sem `produtos.ver` emitiria o papel sem foto nenhuma —
 * e sem descobrir por quê.
 *
 * Ela também não responde "esta pessoa pode ver o catálogo?", e sim "esta foto
 * faz parte de um documento que esta pessoa pode ver?": o item tem que ser do
 * pedido da rota, e o pedido passa pelo mesmo ownership de vendedor do resto do
 * módulo. Sem esse recorte, `pedidos.ver` viraria licença para varrer o
 * catálogo inteiro.
 */
@Controller('pedidos/:uuid/itens/:itemUuid/foto')
export class OrderItemPhotosController {
  constructor(private readonly service: OrderItemPhotosService) {}

  /**
   * Teto próprio e alto: o papel de um pedido grande baixa uma foto por produto
   * distinto de uma vez só, e no teto padrão de 100/min ele sairia incompleto.
   * O cliente já limita a concorrência; isto evita que o limite volte a decidir
   * quantas fotos entram no documento.
   */
  @Get()
  @RequirePermission('pedidos.ver')
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  async content(
    @Param('uuid') uuid: string,
    @Param('itemUuid') itemUuid: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, nomeArquivo } = await this.service.content(uuid, itemUuid, user);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nomeArquivo)}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(buffer);
  }
}
