import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { SuppliersService, CreateSupplierDto } from './suppliers.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

@Controller('fornecedores')
@UseGuards(RolesGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles('ADMIN', 'COMPRAS')
  async create(@Body() dto: CreateSupplierDto, @CurrentUser() user: RequestUser) {
    const data = await this.suppliersService.create(dto, user.tenantId);
    return { data };
  }

  @Get()
  async findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.suppliersService.findAll(user.tenantId, pagination);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    const data = await this.suppliersService.findOne(uuid, user.tenantId);
    return { data };
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'COMPRAS')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: Partial<CreateSupplierDto>,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.suppliersService.update(uuid, dto, user.tenantId);
    return { data };
  }

  @Delete(':uuid')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.suppliersService.remove(uuid, user.tenantId);
  }
}
