import { IsDateString, IsDefined, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreateNotaFiscalDto {
  @IsUUID('4')
  uuid: string;

  @IsDefined() @IsString() numero_nota: string;
  @IsOptional() @IsString() serie?: string;

  @IsDefined() @IsNumber() @IsPositive() valor: number;

  @IsOptional() @IsDateString() data_emissao?: string;
  @IsOptional() @IsString() observacao?: string;
}
