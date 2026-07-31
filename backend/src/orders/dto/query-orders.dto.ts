import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ORDER_ORIGENS, ORDER_STATUSES } from '../entities/order.entity';

/**
 * `status` e `origem` chegavam por `@Query('x')` solto enquanto a paginação
 * chegava por `@Query() PaginationDto`. O ValidationPipe global valida o objeto
 * de query INTEIRO contra esse DTO com `whitelist + forbidNonWhitelisted`
 * (main.ts), então qualquer parâmetro não declarado nele derrubava a requisição
 * com 400 `property origem should not exist` antes de chegar ao service —
 * `search` só funcionava por já estar no `PaginationDto`. Declarar os filtros
 * aqui é o que torna a rota utilizável, e de quebra torna alcançável a
 * validação de enum que o service já fazia. Ver PROB-0081.
 *
 * As mensagens repetem literalmente as de `orders.service.ts` para que a
 * resposta nomeie os valores aceitos, venha ela do DTO ou do service.
 */
export class ListOrdersQueryDto extends PaginationDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES as readonly string[], {
    message: `Status inválido. Use um de: ${ORDER_STATUSES.join(', ')}.`,
  })
  status?: string;

  @IsOptional()
  @IsIn(ORDER_ORIGENS as readonly string[], {
    message: `Origem inválida. Use um de: ${ORDER_ORIGENS.join(', ')}.`,
  })
  origem?: string;
}
