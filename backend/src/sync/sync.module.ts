import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { SyncAuthorizationService } from './sync-authorization.service';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PermissionsModule],
  controllers: [SyncController],
  providers: [SyncService, SyncAuthorizationService],
})
export class SyncModule {}
