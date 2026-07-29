import {
  IsDateString,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Pedido externo — digitado em sistema de terceiro e apenas registrado aqui.
 *
 * Fornecedor e cliente continuam sendo cadastros deste sistema (mesma regra do
 * pedido interno). No lugar dos itens entram número do pedido de origem, nome
 * do sistema e valor.
 *
 * O que este DTO deliberadamente NÃO aceita, pelos mesmos motivos já
 * documentados em `create-order.dto.ts`:
 * - `itens`: pedido externo não tem itens — é o que o distingue.
 * - `status`: nasce 'em_aberto'; 'liberado' só por PATCH /pedidos/:uuid/liberar
 *   (permissão `pedidos.liberar`), 'cancelado' só por PATCH /pedidos/:uuid/status,
 *   'parcialmente_faturado'/'faturado' só pelo FaturamentoService.
 * - `origem` e `total_*`: derivados pelo servidor a partir do endpoint e de `valor`.
 */
export class CreateExternalOrderDto {
  @IsUUID('4')
  uuid: string;

  @IsDefined() @IsUUID('4') cliente_uuid: string;
  @IsDefined() @IsUUID('4') fornecedor_uuid: string;
  @IsOptional() @IsUUID('4') vendedor_uuid?: string | null;
  @IsOptional() @IsUUID('4') transportadora_uuid?: string | null;

  @IsDefined() @IsString() @MaxLength(120) numero_pedido_externo: string;
  @IsDefined() @IsString() @MaxLength(120) sistema_origem: string;

  /** Valor total do pedido no sistema de origem. Vira `total_sem_imposto` e `total_com_imposto`. */
  @IsDefined() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) valor: number;

  @IsOptional() @IsDateString() data?: string | null;
  @IsOptional() @IsString() pgt?: string | null;
  @IsOptional() @IsString() prazo?: string | null;
  @IsOptional() @IsString() local_entrega?: string | null;
  @IsOptional() @IsString() observacao?: string | null;
  @IsOptional() @IsString() tipo_faturamento?: string | null;
}

export class UpdateExternalOrderDto extends CreateExternalOrderDto {
  @IsInt()
  @Min(1)
  version: number;
}
