import { IsDecimal, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class CreateComissaoDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional()
  @IsUUID('4')
  cliente_uuid?: string;

  @IsOptional()
  @IsNumber()
  fornecedor_id?: number;

  @IsOptional()
  @IsString()
  numero_pedido?: string;

  @IsOptional()
  @IsString()
  numero_nfe?: string;

  @IsOptional()
  @IsString()
  data_pedido?: string;

  @IsOptional()
  @IsString()
  data_faturamento?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_pedido?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_faturado?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  perc_comissao?: string;

  /** Snapshot calculado no lançamento */
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_comissao: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateComissaoDto extends VersionDto {
  @IsOptional()
  @IsString()
  numero_nfe?: string;

  @IsOptional()
  @IsString()
  data_faturamento?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_faturado?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_comissao?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
