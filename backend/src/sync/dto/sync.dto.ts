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
}

export class SyncItemDto {
  @IsNotEmpty()
  @IsString()
  uuid: string;

  @IsNotEmpty()
  @IsEnum(SyncEntity)
  entity: SyncEntity;

  @IsNotEmpty()
  @IsString()
  operation: 'CREATE' | 'UPDATE' | 'DELETE';

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
 * CHANGELOG #8: Sync por entidade — cursor único para múltiplas tabelas era indefinido
 */
export class SyncPullDto {
  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  limit?: number = 100;
}
