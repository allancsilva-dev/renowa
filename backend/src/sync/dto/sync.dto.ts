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
  Matches,
  IsInt,
  Min,
  Max,
  IsUUID,
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

export class SyncItemV2Dto {
  @IsUUID()
  operation_id: string;

  @IsUUID()
  uuid: string;

  @IsEnum(SyncEntity)
  entity: SyncEntity;

  @IsEnum(SyncOperation)
  operation: SyncOperation;

  @IsObject()
  payload: Record<string, unknown>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  base_version?: number;
}

export class SyncPushV2Dto {
  @IsUUID()
  device_id: string;

  @IsOptional()
  @IsUUID()
  sync_run_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMaxSize(200)
  @Type(() => SyncItemV2Dto)
  items: SyncItemV2Dto[];
}

/** bigint fica string no contrato HTTP para não perder precisão em JavaScript. */
export class SyncPullV2Dto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  cursor: string = '0';

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  highWatermark?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit: number = 200;
}
