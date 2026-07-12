import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class CreateParceiroDto {
  @IsUUID('4')
  uuid: string;

  @IsString()
  nome_parceiro: string;

  @IsOptional()
  @IsString()
  empresa_parceiro?: string;

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

  @IsString()
  data_pedido: string;

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
  percentual_comissao?: number;

  @IsNumber()
  @Min(0)
  valor_comissao: number;

  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateParceiroDto extends VersionDto {
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
  percentual_comissao?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_comissao?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
