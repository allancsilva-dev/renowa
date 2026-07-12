import {
  IsString,
  IsNotEmpty,
  IsArray,
  IsObject,
  ValidateNested,
  ArrayMaxSize,
  IsOptional,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SyncEntity {
  CLIENTES = 'clientes',
  PEDIDOS = 'pedidos',
  PRODUTOS = 'produtos',
  FORNECEDORES = 'fornecedores',
  TRANSPORTADORAS = 'transportadoras',
  ITENS_PEDIDO = 'itens_pedido',
}

export enum SyncOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export class SyncItemDto {
  @IsNotEmpty()
  @IsString()
  uuid: string;

  @IsNotEmpty()
  @IsEnum(SyncEntity)
  entity: SyncEntity;

  @IsNotEmpty()
  @IsEnum(SyncOperation)
  operation: SyncOperation;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @IsDateString()
  client_timestamp?: string;
}

/**
 * CHANGELOG #4: Transaction por item no POST /api/sync
 * CHANGELOG #11: Limite de 200 items por request
 */
export class SyncPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(200)  // CHANGELOG #11
  @Type(() => SyncItemDto)
  items: SyncItemDto[];
}

/**
 * CHANGELOG #8: Sync por entidade — cursor único para múltiplas tabelas era indefinido.
 * CHANGELOG #13: cursor é offset numérico simples (limitação documentada — migrar para keyset na v2.0).
 */
export class SyncPullDto {
  @IsOptional()
  @IsDateString()
  since?: string;

  /** Offset numérico — ex: 0, 200, 400 */
  @IsOptional()
  @Type(() => Number)
  cursor?: number = 0;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 200;
}
