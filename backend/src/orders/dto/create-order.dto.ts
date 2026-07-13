import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsPositive,
  Min,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional() @IsUUID('4') produto_uuid?: string;
  @IsOptional() @IsString() codigo_manual?: string;
  @IsOptional() @IsString() descricao_manual?: string;
  @IsOptional() @IsNumber() @Min(0) qtd_caixas?: number;
  @IsOptional() @IsNumber() @Min(0) qtd_unitaria?: number;
  @IsOptional() @IsNumber() @IsPositive() preco_unitario?: number;
  @IsOptional() @IsNumber() @Min(0) desconto_perc?: number;
  @IsOptional() @IsNumber() @Min(0) total_item?: number;
}

export class CreateOrderDto {
  @IsUUID('4')
  uuid: string;

  @IsOptional() @IsUUID('4') cliente_uuid?: string;
  @IsOptional() @IsUUID('4') vendedor_uuid?: string;
  @IsOptional() @IsUUID('4') fornecedor_uuid?: string;
  @IsOptional() @IsUUID('4') transportadora_uuid?: string;

  @IsOptional() @IsDateString() data?: string;

  /** 'em_aberto' | 'concluido' | 'cancelado' */
  @IsOptional() @IsString() status?: string;

  @IsOptional() @IsNumber() @Min(0) total_sem_imposto?: number;
  @IsOptional() @IsNumber() @Min(0) total_com_imposto?: number;
  @IsOptional() @IsString() pgt?: string;
  @IsOptional() @IsString() prazo?: string;
  @IsOptional() @IsString() local_entrega?: string;
  @IsOptional() @IsString() observacao?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  itens?: CreateOrderItemDto[];
}
