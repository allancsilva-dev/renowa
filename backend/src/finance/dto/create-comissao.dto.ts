import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
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
  @IsNumber()
  @Min(0)
  valor_pedido?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_faturado?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perc_comissao?: number;

  /** Snapshot calculado no lançamento */
  @IsNumber()
  @Min(0)
  valor_comissao: number;

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
  @IsNumber()
  @Min(0)
  valor_faturado?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_comissao?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
