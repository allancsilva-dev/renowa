import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { LgpdRequest } from './entities/lgpd-request.entity';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({ imports: [TypeOrmModule.forFeature([LgpdRequest]), AuditModule], controllers: [PrivacyController], providers: [PrivacyService] })
export class PrivacyModule {}
