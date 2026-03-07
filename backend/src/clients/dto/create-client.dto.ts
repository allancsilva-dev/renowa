import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsBoolean,
  IsNumber,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class EnderecoDto {
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() @MaxLength(2) estado?: string;
  @IsOptional() @IsString() @MaxLength(9) cep?: string;
}

export class CreateClientDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  razao_social: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nome_fantasia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cnpj_cpf?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsNumber()
  limite_credito?: number;
}
