import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsInt, Min } from 'class-validator';
import { CreatePrepostoDto } from './create-preposto.dto';

export class UpdatePrepostoDto extends PartialType(OmitType(CreatePrepostoDto, ['uuid'] as const)) {
  @IsInt() @Min(1) version: number;
}
