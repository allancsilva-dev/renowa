import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { TransportService } from './transport.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { CreateTransportDto } from './dto/create-transport.dto';
import { UpdateTransportDto } from './dto/update-transport.dto';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('transportadoras')
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  @RequirePermission('transportadoras.criar')
  async create(@Body() dto: CreateTransportDto, @CurrentUser() user: RequestUser) {
    return this.transportService.create(dto, user.tenantId);
  }

  /** Upload + parse são caros: limite agressivo para conter abuso/DoS. */
  @Post('importacao')
  @RequirePermission('transportadoras.criar')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.importFromFile(file, user.tenantId);
  }

  @Get()
  @RequirePermission('transportadoras.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.findAll(user.tenantId, pagination, search);
  }

  @Get('disponibilidade-cnpj')
  @RequirePermission('transportadoras.ver')
  async cnpjAvailability(
    @Query('cnpj') cnpj: string,
    @Query('excludeUuid') excludeUuid: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.cnpjAvailability(cnpj, user.tenantId, excludeUuid);
  }

  @Get(':uuid')
  @RequirePermission('transportadoras.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.transportService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @RequirePermission('transportadoras.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateTransportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @RequirePermission('transportadoras.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.transportService.remove(uuid, user.tenantId);
  }
}
