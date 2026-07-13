import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';
import { PasswordService } from '../auth/password.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      User,
      LocalUser,
      TenantRole,
      TenantRolePermission,
    ]),
  ],
  controllers: [UsersController],
  // PasswordService não tem dependências — provido localmente para evitar ciclo com AuthModule.
  providers: [UsersService, PasswordService],
  exports: [UsersService],
})
export class UsersModule {}
