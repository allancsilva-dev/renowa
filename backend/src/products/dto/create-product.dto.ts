import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class CreateProductDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional() @IsUUID('4') fornecedor_uuid?: string;

  @IsOptional() @IsString() codigo?: string;

  @IsNotEmpty() @IsString()
  descricao: string;

  @IsOptional() @IsNumber() @IsPositive()
  preco_base?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100)
  ipi_perc?: number;
}
