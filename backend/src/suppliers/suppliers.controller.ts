import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SuppliersService } from './suppliers.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { IsCnpj } from '../common/validators/brazilian-document.validators';

class CreateSupplierDto {
  @IsUUID('4') uuid: string;
  @IsNotEmpty() @IsString() razao_social: string;
  @IsOptional() @IsString() @IsCnpj() cnpj?: string;
}

/** Criar/Editar: ADMIN, VENDEDOR, GESTAO | Excluir: ADMIN, GESTAO */
@Controller('fornecedores')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermission('fornecedores.criar')
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: RequestUser) {
    return this.suppliersService.create(dto, user.tenantId);
  }

  @Get()
  @RequirePermission('fornecedores.ver')
  async findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.suppliersService.findAll(user.tenantId, pagination);
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
    @Body() dto: Partial<CreateSupplierDto>,
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
