import { IsNotEmpty, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { IsCep, IsCnpj } from '../../common/validators/brazilian-document.validators';

export class CreateSupplierDto {
  @IsUUID('4') uuid: string;

  @IsNotEmpty() @IsString() razao_social: string;

  @IsOptional() @IsString() @IsCnpj() cnpj?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() @Length(2, 2) uf?: string;
  @IsOptional() @IsString() @IsCep() cep?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsString() inscricao_estadual?: string;
}
