import { IsDecimal, IsOptional, IsString, IsUUID } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class CreateInadimplenciaDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional()
  @IsUUID('4')
  cliente_uuid?: string;

  @IsOptional()
  @IsString()
  empresa_devedora?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_aberto?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class UpdateInadimplenciaDto extends VersionDto {
  @IsOptional()
  @IsString()
  empresa_devedora?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor_aberto?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}
