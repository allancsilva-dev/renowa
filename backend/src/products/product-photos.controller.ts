import {
  Controller, Get, Put, Delete, Param, Query, Res, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ProductPhotosService } from './product-photos.service';
import { MAX_PHOTO_SIZE_BYTES } from '../common/images/image-validation';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  RequireAnyPermission, RequirePermission,
} from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { VersionDto } from '../common/dto/version.dto';

/**
 * Foto do produto no catálogo: uma por produto.
 *
 * `PUT` e não `POST` porque a operação é idempotente por produto — subir de
 * novo substitui, não acumula.
 *
 * Quem emite o papel do pedido NÃO passa por aqui: estas rotas são de catálogo e
 * exigem `produtos.ver`, então um perfil com `pedidos.ver` sem acesso ao catálogo
 * emitiria o papel sem foto nenhuma. Os bytes para o papel saem de
 * `GET /pedidos/:uuid/itens/:itemUuid/foto`.
 */
@Controller('produtos/:uuid/foto')
export class ProductPhotosController {
  constructor(private readonly photosService: ProductPhotosService) {}

  /** Metadados da foto atual, ou `null` — produto sem foto não é erro. */
  @Get()
  @RequirePermission('produtos.ver')
  async find(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.photosService.find(uuid, user.tenantId);
  }

  /**
   * Upload é caro (binário + varredura de magic bytes): limite agressivo.
   *
   * `criar` OU `editar` porque definir a foto é parte dos dois: quem cadastra o
   * produto anexa a foto no mesmo fluxo, logo depois do POST. Com AND puro, um
   * perfil com `produtos.criar` sem `produtos.editar` criava o produto e tomava
   * 403 na foto.
   */
  @Put()
  @RequireAnyPermission('produtos.criar', 'produtos.editar')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async upsert(
    @Param('uuid') uuid: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.photosService.upsert(uuid, file, user.tenantId);
  }

  /**
   * Bytes da imagem. `passthrough: true` deixa o Nest concluir a resposta a
   * partir do `StreamableFile` retornado — o `ResponseInterceptor` tem exceção
   * explícita para ele, senão o binário sairia embrulhado em `{ data }`.
   *
   * `nosniff` + whitelist de MIME no upload: sem os dois, um arquivo cujo tipo
   * o browser adivinhe diferente do declarado vira XSS no domínio da app.
   *
   * Teto próprio e alto: emitir o papel de um pedido grande é uma rajada
   * legítima de centenas de GETs, e no teto padrão de 100/min ela sairia
   * incompleta. Ainda assim é teto — varrer o catálogo inteiro esbarra nele.
   */
  @Get('conteudo')
  @RequirePermission('produtos.ver')
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  async content(
    @Param('uuid') uuid: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, nomeArquivo } = await this.photosService.content(uuid, user.tenantId);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nomeArquivo)}"`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(buffer);
  }

  @Delete()
  @RequirePermission('produtos.editar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('uuid') uuid: string,
    @Query() versionDto: VersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.photosService.remove(uuid, versionDto.version, user.tenantId);
  }
}
