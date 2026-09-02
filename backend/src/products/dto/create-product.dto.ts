import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsPositive,
  IsUUID,
  Min,
  Max,
  ValidateIf,
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

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  quantidade?: number;
}
