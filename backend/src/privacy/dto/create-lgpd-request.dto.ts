import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateLgpdRequestDto {
  @IsIn(['CLIENT', 'USER']) subjectType: 'CLIENT' | 'USER';
  @IsUUID() subjectUuid: string;
  @IsIn(['ERASURE', 'EXPORT']) requestType: 'ERASURE' | 'EXPORT';
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ReviewLgpdRequestDto {
  @IsString() @MaxLength(2000) legalBasis: string;
}

export class DenyLgpdRequestDto extends ReviewLgpdRequestDto {
  @IsString() @MaxLength(1000) reason: string;
}
