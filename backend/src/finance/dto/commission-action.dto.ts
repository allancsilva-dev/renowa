import { IsDateString, IsDecimal, Matches } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class InformarPercentualDto extends VersionDto {
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  perc_comissao: string;
}

export class RegistrarPagamentoDto extends VersionDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'data_pagamento deve estar no formato YYYY-MM-DD.' })
  @IsDateString({ strict: true })
  data_pagamento: string;
}

export class BloquearComissaoDto extends VersionDto {}

export class EstornarPagamentoDto extends VersionDto {}
