import { IsDateString, IsDefined, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateNotaFiscalDto {
  @IsUUID('4')
  uuid: string;

  @IsDefined() @IsString() numero_nota: string;
  @IsOptional() @IsString() serie?: string;

  @IsDefined() @IsNumber() @IsPositive() valor: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) perc_comissao?: number;

  @IsOptional() @IsDateString() data_emissao?: string;
  @IsOptional() @IsString() observacao?: string;
}
