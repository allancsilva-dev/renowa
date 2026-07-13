import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListAuditEventsDto {
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) page = 1;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsIn(['READ', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'AUDIT_READ']) action?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsUUID() actorId?: string;
}
