import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsNumber,
  IsPositive,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  codigo?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  descricao: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  unidade?: string = 'UN';

  @IsNumber()
  @IsPositive()
  preco_venda: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  preco_custo?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estoque_atual?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estoque_minimo?: number;

  @IsOptional()
  @IsString()
  fornecedor_uuid?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}
