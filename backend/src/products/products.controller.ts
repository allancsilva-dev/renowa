import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('produtos')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermission('produtos.criar')
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    return this.productsService.create(dto, user.tenantId);
  }

  /** Upload + parse são caros: limite agressivo para conter abuso/DoS. */
  @Post('importacao')
  @RequirePermission('produtos.criar')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @Body('fornecedor_uuid') fornecedorUuid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.importFromFile(file, fornecedorUuid, user.tenantId);
  }

  @Get()
  @RequirePermission('produtos.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @Query('fornecedor_uuid') fornecedorUuid: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.findAll(user.tenantId, pagination, search, fornecedorUuid);
  }

  @Get(':uuid')
  @RequirePermission('produtos.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.productsService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @RequirePermission('produtos.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: Partial<CreateProductDto>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @RequirePermission('produtos.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.productsService.remove(uuid, user.tenantId);
  }
}
