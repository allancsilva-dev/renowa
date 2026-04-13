import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwksStrategy } from './jwks.strategy';
import { MobileSessionService } from './mobile-session.service';
import { AuthService, AuthControllerImpl } from './auth.service';
import { AuthController } from './auth.controller';
import { MobileSession } from './entities/mobile-session.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MobileSession]),
    forwardRef(() => UsersModule),
  ],
  controllers: [AuthControllerImpl, AuthController],
  providers: [JwksStrategy, MobileSessionService, AuthService],
  exports: [JwksStrategy, MobileSessionService],
})
export class AuthModule {}
