import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SuppliersService } from './suppliers.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

class CreateSupplierDto {
  @IsUUID('4') uuid: string;
  @IsNotEmpty() @IsString() razao_social: string;
  @IsOptional() @IsString() cnpj?: string;
}

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('fornecedores')
@UseGuards(RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: RequestUser) {
    return this.suppliersService.create(dto, user.tenantId);
  }

  @Get()
  async findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.suppliersService.findAll(user.tenantId, pagination);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.suppliersService.findOne(uuid, user.tenantId);
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'VENDEDOR', 'GESTAO')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: Partial<CreateSupplierDto>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.suppliersService.update(uuid, dto, user.tenantId);
  }

  @Delete(':uuid')
  @Roles('ADMIN', 'GESTAO')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.suppliersService.remove(uuid, user.tenantId);
  }
}
