import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateMovementDto {
  @IsUUID('4')
  uuid: string;

  /** 'Custo Fixo' | 'Custo Rotativo' | 'Venda' */
  @IsNotEmpty()
  @IsString()
  tipo: string;

  @IsNumber()
  @Min(0)
  valor: number;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
