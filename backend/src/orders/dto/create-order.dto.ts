import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional() @IsUUID('4') produto_uuid?: string;
  @IsOptional() @IsString() codigo_manual?: string | null;
  @IsOptional() @IsString() descricao_manual?: string | null;
  @IsDefined() @IsNumber() @Min(0) qtd_caixas: number;
  @IsDefined() @IsNumber() @Min(0) qtd_unitaria: number;
  @IsDefined() @IsNumber() @Min(0) preco_unitario: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) desconto_perc?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) ipi_perc?: number;
}

export class CreateOrderDto {
  @IsUUID('4')
  uuid: string;

  @IsDefined() @IsUUID('4') cliente_uuid: string;
  @IsOptional() @IsUUID('4') vendedor_uuid?: string | null;
  @IsDefined() @IsUUID('4') fornecedor_uuid: string;
  @IsOptional() @IsUUID('4') transportadora_uuid?: string | null;

  @IsOptional() @IsDateString() data?: string | null;
  // `status` NÃO é aceito no corpo de create/update — é derivado.
  // Criação nasce 'em_aberto'; 'liberado' só por PATCH /pedidos/:uuid/liberar
  // (permissão `pedidos.liberar`); 'cancelado' só por PATCH /pedidos/:uuid/status;
  // 'parcialmente_faturado'/'faturado' só pelo FaturamentoService.
  // Aceitá-lo aqui tornava `pedidos.liberar` contornável — ver order.entity.ts.
  @IsOptional() @IsString() pgt?: string | null;
  @IsOptional() @IsString() prazo?: string | null;
  @IsOptional() @IsString() local_entrega?: string | null;
  @IsOptional() @IsString() observacao?: string | null;
  @IsOptional() @IsString() tipo_faturamento?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  itens: CreateOrderItemDto[];
}

export class UpdateOrderDto extends CreateOrderDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class DuplicateOrderItemDto extends CreateOrderItemDto {
  /** Item do pedido fonte cuja foto específica será copiada, quando existir. */
  @IsOptional() @IsUUID('4') foto_origem_item_uuid?: string;
}

export class DuplicateOrderDto extends CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => DuplicateOrderItemDto)
  declare itens: DuplicateOrderItemDto[];
}
