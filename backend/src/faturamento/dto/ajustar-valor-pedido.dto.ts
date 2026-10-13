import { IsDefined, IsInt, IsNumber, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

/** Ajuste do valor do pedido no Faturamento — só ADMIN (ver FaturamentoController). */
export class AjustarValorPedidoDto {
  @IsDefined()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(9_999_999_999_999)
  valor: number;

  @IsDefined()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo: string;

  @IsInt()
  @Min(1)
  version: number;
}
