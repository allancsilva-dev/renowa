import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
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
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() cidade?: string;
  @IsOptional() @IsString() @Length(2, 2) uf?: string;
  @IsOptional() @IsString() @IsCep() cep?: string;
  @IsOptional() @IsString() contato?: string;
  @IsOptional() @IsString() inscricao_estadual?: string;
  @IsOptional() @IsString() suframa?: string;
  // 255 não é enfeite: a coluna é varchar sem tamanho e o campo ainda aceita
  // texto livre (import CSV, push do sync). Sem limite, um payload de centenas
  // de KB volta em toda listagem e em todo pull, e nunca casa com o filtro da
  // tela. Continua sem @IsIn para não apagar valor legado.
  @IsOptional() @IsString() @MaxLength(255) pgt_padrao?: string;
  @IsOptional() @IsString() prazo?: string;
  @IsOptional() @IsString() local_entrega?: string;
  @IsOptional() @IsString() observacao?: string;
  @IsOptional() @IsUUID('4') transportadora_uuid?: string;
}
