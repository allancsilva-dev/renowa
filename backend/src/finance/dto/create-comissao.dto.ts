import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateComissaoDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional()
  @IsUUID('4')
  pedido_uuid?: string;

  @IsOptional()
  @IsString()
  nfe?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor_faturado?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perc_comissao?: number;

  /** Snapshot imutável — calculado no momento do lançamento, nunca recalculado */
  @IsNumber()
  @Min(0)
  valor_comissao: number;

  @IsOptional()
  @IsString()
  data_faturamento?: string;
}
