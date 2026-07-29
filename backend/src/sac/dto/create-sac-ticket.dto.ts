import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSacTicketItemDto {
  @IsUUID('4')
  uuid: string;

  /** Vínculo opcional com produto cadastrado; o código sempre é persistido. */
  @IsOptional() @IsUUID('4') produto_uuid?: string;

  @IsDefined() @IsString() @MaxLength(120) codigo: string;
  @IsDefined() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) quantidade: number;
  @IsDefined() @IsString() @MaxLength(255) motivo: string;
  @IsDefined() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) valor_unitario: number;
  // `valor_total` NÃO é aceito: é derivado (quantidade × valor_unitario).
}

/**
 * `status` não é aceito no corpo — chamado nasce 'aberto' e a transição só
 * acontece por PATCH /sac/:uuid/status, que valida o caminho. Aceitá-lo aqui
 * permitiria pular direto para 'resolvido' num POST.
 * `total` também não: é a soma dos itens, calculada no servidor.
 */
export class CreateSacTicketDto {
  @IsUUID('4')
  uuid: string;

  @IsDefined() @IsUUID('4') cliente_uuid: string;
  @IsDefined() @IsUUID('4') fornecedor_uuid: string;

  @IsOptional() @IsString() @MaxLength(120) numero_nfe?: string | null;
  @IsOptional() @IsDateString() data?: string | null;
  @IsOptional() @IsString() observacao?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSacTicketItemDto)
  itens: CreateSacTicketItemDto[];
}

export class UpdateSacTicketDto extends CreateSacTicketDto {
  @IsInt()
  @Min(1)
  version: number;
}
