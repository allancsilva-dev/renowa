import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export class ListPrepostoVendasDto extends PaginationDto {
  @IsOptional() @IsUUID('4') preposto_uuid?: string;
  @IsOptional() @IsIn(['pendente', 'pago']) status?: 'pendente' | 'pago';
  @IsOptional() @Matches(DATA) @IsDateString({ strict: true }) data_inicio?: string;
  @IsOptional() @Matches(DATA) @IsDateString({ strict: true }) data_fim?: string;
}

export class AlterarPercentualVendaDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) perc_comissao: number;
  @IsInt() @Min(1) version: number;
}

/** `data_pagamento` preenchida paga; `null` estorna. */
export class PagamentoVendaDto {
  @ValidateIf((_, value) => value !== null)
  @Matches(DATA) @IsDateString({ strict: true })
  data_pagamento: string | null;

  @IsInt() @Min(1) version: number;
}
