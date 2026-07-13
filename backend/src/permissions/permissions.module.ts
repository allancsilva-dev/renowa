import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../common/entities/permission.entity';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, TenantRolePermission])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
