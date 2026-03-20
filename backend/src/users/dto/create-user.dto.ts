import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(100)
  role: string;

  // Fallback temporário enquanto a resolução por e-mail no Auth não está acoplada.
  @IsOptional()
  @IsUUID()
  authUserId?: string;
}
