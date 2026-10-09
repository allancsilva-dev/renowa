import { IsDateString, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
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

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_inicio deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_inicio?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_fim deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_fim?: string;

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

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_inicio deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_inicio?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_fim deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_fim?: string;
}

export class FaturadosQueryDto extends PaginationDto {
  @IsOptional() @IsString() mes?: string;
  @IsOptional() @IsString() ano?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_inicio deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_inicio?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_fim deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_fim?: string;
  @IsOptional() @IsUUID() fornecedor_uuid?: string;
}

/** Sem paginação: a rota agrupa tudo do período por fornecedor. */
export class VendasPorEmpresaQueryDto {
  @IsOptional() @IsString() fornecedor_id?: string;
  @IsOptional() @IsString() mes?: string;
  @IsOptional() @IsString() ano?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_inicio deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_inicio?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_fim deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_fim?: string;
  @IsOptional() @IsString() search?: string;
}

export class ResumoComissoesQueryDto {
  @IsOptional() @IsString() mes?: string;
  @IsOptional() @IsString() ano?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_inicio deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_inicio?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_fim deve estar no formato YYYY-MM-DD.' }) @IsDateString({ strict: true }) data_fim?: string;
}
