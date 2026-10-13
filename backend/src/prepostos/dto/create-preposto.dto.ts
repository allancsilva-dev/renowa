import { Transform } from 'class-transformer';
import {
  IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { IsCpfOrCnpj } from '../../common/validators/brazilian-document.validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
/** Vazio vira null: campo opcional apagado na tela não deve gravar ''. */
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};
const digitsOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const digits = value.replace(/\D/g, '');
  return digits === '' ? null : digits;
};

export class CreatePrepostoDto {
  @IsUUID('4') uuid: string;

  @Transform(trim) @IsNotEmpty() @IsString() @MinLength(2) @MaxLength(200)
  nome: string;

  @Transform(digitsOrNull) @IsOptional() @IsString() @IsCpfOrCnpj()
  documento?: string | null;

  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(30)
  telefone?: string | null;

  @Transform(trimOrNull) @IsOptional() @IsEmail() @MaxLength(200)
  email?: string | null;

  @Transform(trimOrNull) @IsOptional() @IsString() @MaxLength(1000)
  endereco_completo?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  percentual_comissao: number;
}
