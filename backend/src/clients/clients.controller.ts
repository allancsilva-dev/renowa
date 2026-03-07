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
  UseGuards,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

@Controller('clientes')
@UseGuards(RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles('ADMIN', 'VENDAS')
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.clientsService.create(dto, user.tenantId);
    return { data };
  }

  @Get()
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.clientsService.findAll(user.tenantId, pagination, search);
  }

  @Get(':uuid')
  async findOne(
    @Param('uuid') uuid: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.clientsService.findOne(uuid, user.tenantId);
    return { data };
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'VENDAS')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.clientsService.update(uuid, dto, user.tenantId);
    return { data };
  }

  @Delete(':uuid')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('uuid') uuid: string,
    @CurrentUser() user: RequestUser,
  ): Promise<void> {
    await this.clientsService.remove(uuid, user.tenantId);
  }
}
