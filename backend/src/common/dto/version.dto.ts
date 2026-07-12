import { IsInt, Min } from 'class-validator';

export class VersionDto {
  @IsInt()
  @Min(1)
  version: number;
}
