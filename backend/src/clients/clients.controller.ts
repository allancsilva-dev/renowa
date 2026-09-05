import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';

const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Visualizar: todos | Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO
 */
@Controller('clientes')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @RequirePermission('clientes.criar')
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: RequestUser) {
    return this.clientsService.create(dto, user);
  }

  /** Upload + parse são caros: limite agressivo para conter abuso/DoS. */
  @Post('importacao')
  @RequirePermission('clientes.criar')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_IMPORT_FILE_SIZE_BYTES } }))
  async importar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.importFromFile(file, user.tenantId);
  }

  @Get()
  @RequirePermission('clientes.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.findAll(user, pagination, search);
  }

  @Get('disponibilidade-cnpj')
  @RequirePermission('clientes.ver')
  async cnpjAvailability(
    @Query('cnpj') cnpj: string,
    @Query('excludeUuid') excludeUuid: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.cnpjAvailability(cnpj, user.tenantId, excludeUuid);
  }

  @Get(':uuid')
  @RequirePermission('clientes.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.clientsService.findOneForUser(uuid, user);
  }

  @Patch(':uuid')
  @RequirePermission('clientes.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.update(uuid, dto, user);
  }

  @Delete(':uuid')
  @RequirePermission('clientes.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.clientsService.remove(uuid, user);
  }
}
