import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { IsCep, IsCnpj } from '../../common/validators/brazilian-document.validators';

export class CreateClientDto {
  @IsUUID('4')
  uuid: string;

  @IsNotEmpty()
  @IsString()
  razao_social: string;

  @IsOptional() @IsString() @IsCnpj() cnpj?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() tel?: string;
  @IsOptional() @IsString() endereco?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() @Length(2, 2) uf?: string;
  @IsOptional() @IsString() @IsCep() cep?: string;
  @IsOptional() @IsString() contato?: string;
  @IsOptional() @IsString() inscricao_estadual?: string;
  @IsOptional() @IsString() suframa?: string;
  @IsOptional() @IsString() pgt_padrao?: string;
  @IsOptional() @IsString() prazo?: string;
  @IsOptional() @IsString() local_entrega?: string;
  @IsOptional() @IsString() observacao?: string;
  @IsOptional() @IsUUID('4') transportadora_uuid?: string;
}
