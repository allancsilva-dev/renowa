import { VersionColumn } from 'typeorm';
import { BaseEntity } from './base.entity';

export abstract class VersionedBaseEntity extends BaseEntity {
  @VersionColumn({ type: 'integer', default: 1 })
  version: number;
}
