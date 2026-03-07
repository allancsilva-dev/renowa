import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
  @IsNumber()
  @Min(0)
  valor_aberto?: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}
