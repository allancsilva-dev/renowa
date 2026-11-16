import { IsEmail, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MaxLength(255)
  nome: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  senha: string;

  @IsString()
  @MaxLength(100)
  role: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  percentual_comissao?: number;
}
