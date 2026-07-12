import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class UpdateMovementDto extends VersionDto {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valor?: number;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
