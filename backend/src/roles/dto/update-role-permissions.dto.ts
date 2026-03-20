import { ArrayUnique, IsArray, IsString, MaxLength } from 'class-validator';

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permissions: string[];
}
