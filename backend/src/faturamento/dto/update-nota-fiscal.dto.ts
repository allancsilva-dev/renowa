import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { VersionDto } from '../../common/dto/version.dto';

export class UpdateNotaFiscalDto extends VersionDto {
  @IsOptional() @IsString() numero_nota?: string;
  @IsOptional() @IsString() serie?: string;
  @IsOptional() @IsNumber() @IsPositive() valor?: number;
  @IsOptional() @IsDateString() data_emissao?: string;
  @IsOptional() @IsString() observacao?: string;
}
