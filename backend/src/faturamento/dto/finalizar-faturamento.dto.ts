import { IsDefined, IsInt, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class FinalizarFaturamentoDto {
  @IsUUID('4')
  uuid: string;

  @IsInt()
  @Min(1)
  version: number;

  @IsDefined()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  motivo: string;
}

export class ReabrirFaturamentoDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsInt()
  @Min(1)
  finalizacao_version: number;

  @IsDefined()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  motivo: string;
}
