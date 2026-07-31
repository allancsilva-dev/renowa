import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SAC_STATUSES } from '../sac.service';

/**
 * Mesmo defeito e mesma correção de `ListOrdersQueryDto`: `status` chegava por
 * `@Query('status')` solto e o `forbidNonWhitelisted` global derrubava a
 * requisição com 400 antes do service. Ver PROB-0081.
 */
export class ListSacQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(SAC_STATUSES as readonly string[], {
    message: `Status inválido. Use um de: ${SAC_STATUSES.join(', ')}.`,
  })
  status?: string;
}
