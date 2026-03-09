import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateComissaoDto {
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
