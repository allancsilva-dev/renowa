import { IsOptional, IsUUID } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class FindProductsQueryDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4')
  fornecedor_uuid?: string;
}
