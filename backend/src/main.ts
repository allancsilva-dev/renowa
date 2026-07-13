import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as compression from 'compression';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { runMigrations } from './database/migrate';
import { resolveTrustProxy } from './config/trust-proxy.config';

async function bootstrap() {
  const trustProxy = resolveTrustProxy();

  if (process.env.NODE_ENV === 'production') {
    await runMigrations();
  }

  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  app.setGlobalPrefix('api');

  app.use(cookieParser());

  // Gzip compression for larger sync payloads.
  app.use(compression());

  // Global DTO validation.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global error shape: { error: { code, message, timestamp } }
  app.useGlobalFilters(new GlobalExceptionFilter());

  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production' && !corsOrigins?.length) {
    throw new Error('CORS_ORIGIN is required in production');
  }
  app.enableCors({
    origin: corsOrigins ?? ['http://localhost:5173'],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Renowa API rodando na porta ${port}`);
}

bootstrap();
