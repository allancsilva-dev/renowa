import { IsDecimal, IsOptional, IsString } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class UpdateMovementDto extends VersionDto {
  @IsOptional()
  @IsString()
  tipo?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '1,2', force_decimal: false })
  valor?: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}
