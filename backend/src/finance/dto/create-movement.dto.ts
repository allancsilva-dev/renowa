import { IsDecimal, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMovementDto {
  @IsUUID('4')
  uuid: string;

  /** 'Custo Fixo' | 'Custo Rotativo' | 'Venda' */
  @IsNotEmpty()
  @IsString()
  tipo: string;

  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
