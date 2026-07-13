import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { AutoProvisionGuard } from './common/guards/auto-provision.guard';
import { PermissionGuard } from './common/guards/permission.guard';

import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { FinanceModule } from './finance/finance.module';
import { TransportModule } from './transport/transport.module';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        // Prod usa synchronize:false. DB_SYNC=true liga só no 1º boot (DB vazio)
        // para criar o schema; remova a var após as tabelas existirem.
        synchronize:
          config.get<string>('DB_SYNC') === 'true' ||
          config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
        timezone: 'UTC',
      }),
    }),

    // CHANGELOG #11: Rate limiting global — chave por user.sub via UserThrottlerGuard
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    AuthModule,
    ClientsModule,
    OrdersModule,
    ProductsModule,
    SuppliersModule,
    FinanceModule,
    TransportModule,
    SyncModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
  ],
  providers: [
    // Guard global — JwtAuthGuard roda antes do Interceptor (fluxo correto)
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Auto-provision local do usuário por tenant (controlado por PROVISION_MODE)
    { provide: APP_GUARD, useClass: AutoProvisionGuard },

    // Validação de permissões declaradas via @RequirePermission
    { provide: APP_GUARD, useClass: PermissionGuard },

    // CHANGELOG #11: Throttler por user.sub (não por IP)
    { provide: APP_GUARD, useClass: UserThrottlerGuard },

    // Envolve automaticamente responses de sucesso em { data: ... }
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
