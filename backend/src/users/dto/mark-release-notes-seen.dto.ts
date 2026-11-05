import { IsString, Matches, MaxLength } from 'class-validator';

export class MarkReleaseNotesSeenDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'version deve estar no formato X.Y.Z' })
  version!: string;
}
