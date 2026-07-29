import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { IsString } from 'class-validator';
import { SacService } from './sac.service';
import { CreateSacTicketDto, UpdateSacTicketDto } from './dto/create-sac-ticket.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { VersionDto } from '../common/dto/version.dto';

class UpdateSacStatusDto extends VersionDto {
  @IsString()
  status: string;
}

/** Chamados de SAC. Fora do faturamento: não gera nota fiscal nem comissão. */
@Controller('sac')
export class SacController {
  constructor(private readonly sacService: SacService) {}

  @Post()
  @RequirePermission('sac.criar')
  async create(@Body() dto: CreateSacTicketDto, @CurrentUser() user: RequestUser) {
    return this.sacService.create(dto, user);
  }

  @Get()
  @RequirePermission('sac.ver')
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status: string,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sacService.findAll(user.tenantId, pagination, status, search);
  }

  @Get(':uuid')
  @RequirePermission('sac.ver')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    return this.sacService.findOne(uuid, user);
  }

  @Put(':uuid')
  @RequirePermission('sac.editar')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateSacTicketDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sacService.update(uuid, dto, user);
  }

  @Patch(':uuid/status')
  @RequirePermission('sac.editar')
  async updateStatus(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateSacStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.sacService.updateStatus(uuid, dto.status, dto.version, user);
  }

  @Delete(':uuid')
  @RequirePermission('sac.deletar')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('uuid') uuid: string,
    @Query() versionDto: VersionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.sacService.remove(uuid, versionDto.version, user);
  }
}
