import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMobileSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_info?: string;
}

export class MobileSessionResponseDto {
  token: string;
  user: {
    uuid: string;
    nome: string;
    roles: string[];
    tenantId: string;
  };
}
