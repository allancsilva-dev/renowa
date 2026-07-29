import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { LocalUserContextGuard } from './common/guards/local-user-context.guard';
import { PermissionGuard } from './common/guards/permission.guard';

import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { SacModule } from './sac/sac.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { FinanceModule } from './finance/finance.module';
import { TransportModule } from './transport/transport.module';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ConsultasModule } from './consultas/consultas.module';
import { FaturamentoModule } from './faturamento/faturamento.module';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler.storage';

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
        // Migrations SQL são a fonte de verdade do schema em TODO ambiente,
        // inclusive dev. `synchronize` só liga com DB_SYNC=true explícito, para
        // o 1º boot de um DB vazio; remova a var após as tabelas existirem.
        //
        // Nunca reative por NODE_ENV: `synchronize` derruba silenciosamente
        // qualquer objeto sem equivalente em decorator TypeORM (CHECK
        // constraints, índices parciais `WHERE ...`, triggers). Já apagou os
        // 20 CHECKs do schema de dev duas vezes — ver PROB-0059.
        synchronize: config.get<string>('DB_SYNC') === 'true',
        logging: config.get<string>('NODE_ENV') === 'development',
        // PostgreSQL: define timezone da sessão; `timezone` do TypeORM é opção MySQL-only.
        extra: {
          options: '-c timezone=UTC',
          max: Number(config.get<string>('DB_POOL_MAX') ?? 10),
          connectionTimeoutMillis: Number(config.get<string>('DB_CONNECTION_TIMEOUT_MS') ?? 5_000),
          idleTimeoutMillis: Number(config.get<string>('DB_IDLE_TIMEOUT_MS') ?? 30_000),
        },
      }),
    }),

    // CHANGELOG #11: Rate limiting global — chave por user.sub via UserThrottlerGuard
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (!redisUrl && config.get<string>('NODE_ENV') === 'production') {
          throw new Error('REDIS_URL é obrigatória em produção para throttling compartilhado');
        }
        return redisUrl
          ? { throttlers: [{ ttl: 60_000, limit: 100 }], storage: new RedisThrottlerStorage(redisUrl) }
          : [{ ttl: 60_000, limit: 100 }];
      },
    }),

    AuthModule,
    ClientsModule,
    OrdersModule,
    SacModule,
    ProductsModule,
    SuppliersModule,
    FinanceModule,
    TransportModule,
    SyncModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    AuditModule,
    PrivacyModule,
    ConsultasModule,
    FaturamentoModule,
  ],
  providers: [
    // Guard global — JwtAuthGuard roda antes do Interceptor (fluxo correto)
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // Resolve req.localUser a partir do JWT. Fail-closed: não cria usuário.
    { provide: APP_GUARD, useClass: LocalUserContextGuard },

    // Validação de permissões declaradas via @RequirePermission
    { provide: APP_GUARD, useClass: PermissionGuard },

    // CHANGELOG #11: Throttler por user.sub (não por IP)
    { provide: APP_GUARD, useClass: UserThrottlerGuard },

    // Envolve automaticamente responses de sucesso em { data: ... }
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
