import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class LancamentosQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsString()
  mes?: string;

  @IsOptional()
  @IsString()
  ano?: string;
}

export class MovimentacoesQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  tipo?: string;
}

export class ComissoesQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  fornecedor_id?: string;

  @IsOptional()
  @IsString()
  mes?: string;

  @IsOptional()
  @IsString()
  ano?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ParceirosQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  nome_parceiro?: string;

  @IsOptional()
  @IsString()
  mes?: string;

  @IsOptional()
  @IsString()
  ano?: string;
}
