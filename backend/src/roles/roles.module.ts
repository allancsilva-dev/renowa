import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { Permission } from '../common/entities/permission.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantRole,
      TenantRolePermission,
      Permission,
    ]),
    AuditModule,
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
