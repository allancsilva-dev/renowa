import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MobileSession } from './entities/mobile-session.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { MobileSessionService } from './mobile-session.service';
import { AuthControllerImpl } from './auth.service';
import { AuthController } from './auth.controller';
import { NativeAuthService } from './native-auth.service';
import { PasswordService } from './password.service';
import { AccessTokenService } from './access-token.service';
import { RefreshTokenService } from './refresh-token.service';
import { User } from '../users/entities/user.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MobileSession, RefreshToken, User]),
    PermissionsModule,
  ],
  controllers: [AuthControllerImpl, AuthController],
  providers: [
    MobileSessionService,
    NativeAuthService,
    PasswordService,
    AccessTokenService,
    RefreshTokenService,
  ],
  exports: [MobileSessionService, AccessTokenService, PasswordService],
})
export class AuthModule {}
