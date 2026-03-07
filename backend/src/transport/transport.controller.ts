import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { TransportService, CreateTransportDto } from './transport.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

@Controller('transportadoras')
@UseGuards(RolesGuard)
export class TransportController {
  constructor(private readonly transportService: TransportService) {}

  @Post()
  @Roles('ADMIN', 'LOGISTICA')
  async create(@Body() dto: CreateTransportDto, @CurrentUser() user: RequestUser) {
    const data = await this.transportService.create(dto, user.tenantId);
    return { data };
  }

  @Get()
  async findAll(@Query() pagination: PaginationDto, @CurrentUser() user: RequestUser) {
    return this.transportService.findAll(user.tenantId, pagination);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    const data = await this.transportService.findOne(uuid, user.tenantId);
    return { data };
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'LOGISTICA')
  async update(@Param('uuid') uuid: string, @Body() dto: Partial<CreateTransportDto>, @CurrentUser() user: RequestUser) {
    const data = await this.transportService.update(uuid, dto, user.tenantId);
    return { data };
  }

  @Delete(':uuid')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.transportService.remove(uuid, user.tenantId);
  }
}
