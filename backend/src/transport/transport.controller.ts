import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { TransportService } from './transport.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

class CreateTransportDto {
  @IsUUID('4') uuid: string;
  @IsNotEmpty() @IsString() razao_social: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsString() endereco_completo?: string;
}

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('transportadoras')
@UseGuards(RolesGuard)
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  async create(@Body() dto: CreateTransportDto, @CurrentUser() user: RequestUser) {
    return this.transportService.create(dto, user.tenantId);
  }

  @Get()
  async findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.transportService.findAll(user.tenantId, pagination);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.transportService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: Partial<CreateTransportDto>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @Roles('ADMIN', 'GESTAO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.transportService.remove(uuid, user.tenantId);
  }
}
