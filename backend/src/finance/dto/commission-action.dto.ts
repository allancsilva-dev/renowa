import { IsDateString, IsDecimal } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class InformarPercentualDto extends VersionDto {
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  perc_comissao: string;
}

export class RegistrarPagamentoDto extends VersionDto {
  @IsDateString()
  data_pagamento: string;
}
