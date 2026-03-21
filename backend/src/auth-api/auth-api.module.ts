import { Module } from '@nestjs/common';
import { AuthApiService } from './auth-api.service';

@Module({
  providers: [AuthApiService],
  exports: [AuthApiService],
})
export class AuthApiModule {}
