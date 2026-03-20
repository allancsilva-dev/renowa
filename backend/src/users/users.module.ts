import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { TenantRole } from '../rbac/entities/tenant-role.entity';
import { TenantRolePermission } from '../rbac/entities/tenant-role-permission.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      LocalUser,
      TenantRole,
      TenantRolePermission,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
