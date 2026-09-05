import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('fornecedores')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermission('fornecedores.criar')
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: RequestUser) {
    return this.suppliersService.create(dto, user.tenantId);
  }

  /** Upload + parse são caros: limite agressivo para conter abuso/DoS. */
  @Post('importacao')
  @RequirePermission('fornecedores.criar')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.suppliersService.importFromFile(file, user.tenantId);
  }

  @Get()
  @RequirePermission('fornecedores.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.suppliersService.findAll(user.tenantId, pagination, search);
  }

  @Get('disponibilidade-cnpj')
  @RequirePermission('fornecedores.ver')
  async cnpjAvailability(
    @Query('cnpj') cnpj: string,
    @Query('excludeUuid') excludeUuid: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.suppliersService.cnpjAvailability(cnpj, user.tenantId, excludeUuid);
  }

  @Get(':uuid')
  @RequirePermission('fornecedores.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.suppliersService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @RequirePermission('fornecedores.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.suppliersService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @RequirePermission('fornecedores.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.suppliersService.remove(uuid, user.tenantId);
  }
}
