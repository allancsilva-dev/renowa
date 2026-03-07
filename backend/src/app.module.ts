import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';

import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { FinanceModule } from './finance/finance.module';
import { TransportModule } from './transport/transport.module';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './users/users.module';

@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // CHANGELOG #1/#10: ClsModule sem setup() — o TenantContextInterceptor popula após o Guard
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
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
  ],
  providers: [
    // Guard global — JwtAuthGuard roda antes do Interceptor (fluxo correto)
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // CHANGELOG #11: Throttler por user.sub (não por IP)
    { provide: APP_GUARD, useClass: UserThrottlerGuard },

    // CHANGELOG #1: Interceptor global popula CLS após Guard — req.user já disponível
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },

    // Envolve automaticamente responses de sucesso em { data: ... }
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
