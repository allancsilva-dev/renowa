import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { IsCnpj } from '../../common/validators/brazilian-document.validators';

export class CreateTransportDto {
  @IsUUID('4') uuid: string;
  @IsNotEmpty() @IsString() razao_social: string;
  @IsOptional() @IsString() @IsCnpj() cnpj?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsString() endereco_completo?: string;
}
