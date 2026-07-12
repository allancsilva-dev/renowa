import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMobileSessionDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(200)
  senha: string;

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
