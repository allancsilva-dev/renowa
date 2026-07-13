import { Controller, Get, HttpCode, HttpStatus, Post, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(private readonly dataSource: DataSource) {}

  /** Healthcheck — usado pelo Docker e monitoramento externo */
  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/live')
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('health/ready')
  async readiness(): Promise<{ status: string }> {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not_ready', dependency: 'database' });
    }
  }

  @Public()
  @Post('auth/local-logout')
  @HttpCode(HttpStatus.OK)
  localLogout(): { success: boolean } {
    return { success: true };
  }
}
