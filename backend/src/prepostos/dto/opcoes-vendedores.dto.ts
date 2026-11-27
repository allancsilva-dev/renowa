import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_SEARCH_LENGTH } from '../../common/persistence/search-filter';

/**
 * Filtro "Vendedor" da aba Vendedores: só busca por nome.
 *
 * Sem período, status nem paginação: a lista mostra todos os vendedores
 * possíveis, tenham ou não comissão no recorte. Não estende `PaginationDto`
 * porque o `limit = 20` padrão dele cortaria a lista sem aviso.
 */
export class OpcoesVendedoresDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}
