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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';

@Controller('produtos')
@UseGuards(RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles('ADMIN', 'ESTOQUE')
  async create(@Body() dto: CreateProductDto, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.create(dto, user.tenantId);
    return { data };
  }

  @Get()
  async findAll(
    @Query() pagination: PaginationDto,
    @Query('search') search: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.productsService.findAll(user.tenantId, pagination, search);
  }

  @Get(':uuid')
  async findOne(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser) {
    const data = await this.productsService.findOne(uuid, user.tenantId);
    return { data };
  }

  @Patch(':uuid')
  @Roles('ADMIN', 'ESTOQUE')
  async update(
    @Param('uuid') uuid: string,
    @Body() dto: Partial<CreateProductDto>,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.productsService.update(uuid, dto, user.tenantId);
    return { data };
  }

  @Delete(':uuid')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('uuid') uuid: string, @CurrentUser() user: RequestUser): Promise<void> {
    await this.productsService.remove(uuid, user.tenantId);
  }
}
