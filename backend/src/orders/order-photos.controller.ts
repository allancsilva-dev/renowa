import {
  Controller, Get, Post, Delete, Body, Param, Query, Res, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { MAX_PHOTO_SIZE_BYTES, OrderPhotosService } from './order-photos.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { VersionDto } from '../common/dto/version.dto';

/**
 * Fotos do pedido. Anexar/remover exige `pedidos.editar` (mesma permissão que
 * altera o pedido); ver exige `pedidos.ver`. O ownership de vendedor é aplicado
 * dentro do service, que resolve o pedido antes de qualquer operação.
 */
@Controller('pedidos/:uuid/fotos')
export class OrderPhotosController {
  constructor(private readonly photosService: OrderPhotosService) {}

  /** Upload é caro (binário + varredura de magic bytes): limite agressivo. */
  @Post()
  @RequirePermission('pedidos.editar')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async upload(
    @Param('uuid') uuid: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('item_uuid') itemUuid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.photosService.upload(uuid, file, itemUuid || undefined, user);
  }

  @Get()
  @RequirePermission('pedidos.ver')
  async list(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.photosService.list(uuid, user);
  }

  /**
   * Bytes da imagem. `passthrough: true` deixa o Nest concluir a resposta a
   * partir do `StreamableFile` retornado — o `ResponseInterceptor` tem exceção
   * explícita para ele, senão o binário sairia embrulhado em `{ data }`.
   *
   * `nosniff` + whitelist de MIME no upload: sem os dois, um arquivo cujo tipo
   * o browser adivinhe diferente do declarado vira XSS no domínio da app.
   */
  @Get(':fotoUuid/conteudo')
  @RequirePermission('pedidos.ver')
  async content(
    @Param('uuid') uuid: string,
    @Param('fotoUuid') fotoUuid: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, nomeArquivo } = await this.photosService.content(uuid, fotoUuid, user);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nomeArquivo)}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(buffer);
  }

  @Delete(':fotoUuid')
  @RequirePermission('pedidos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('uuid') uuid: string,
    @Param('fotoUuid') fotoUuid: string,
    @Query() versionDto: VersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.photosService.remove(uuid, fotoUuid, versionDto.version, user);
  }
}
