import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  Min,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';

export class CreateOrderItemDto {
  @IsNotEmpty()
  @IsString()
  produto_uuid: string;   // CHANGELOG #3: mobile envia uuid

  @IsNumber()
  @IsPositive()
  quantidade: number;

  @IsNumber()
  @IsPositive()
  preco_unitario: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  desconto_percentual?: number = 0;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observacoes?: string;
}

export class CreateOrderDto {
  @IsNotEmpty()
  @IsString()
  cliente_uuid: string;   // CHANGELOG #3: mobile envia uuid

  @IsOptional()
  @IsString()
  transportadora_uuid?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus = OrderStatus.RASCUNHO;

  @IsNotEmpty()
  @IsDateString()
  data_pedido: string;

  @IsOptional()
  @IsDateString()
  data_entrega_prevista?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  itens: CreateOrderItemDto[];
}
