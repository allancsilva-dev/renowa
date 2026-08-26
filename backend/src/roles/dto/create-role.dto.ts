import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Espaços viram nome vazio no `normalizeName` do service (`trim().toLowerCase()`),
 * e `@IsNotEmpty()` sozinho aceita `"   "`. O trim tem que acontecer antes da
 * validação, não depois.
 */
export const trimRoleName = ({ value }: { value: unknown }) =>
  (typeof value === 'string' ? value.trim() : value);

export class CreateRoleDto {
  @Transform(trimRoleName)
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissions?: string[];
}
