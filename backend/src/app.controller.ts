import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
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
  readiness(): { status: string } {
    return { status: 'ready' };
  }

  @Public()
  @Post('auth/local-logout')
  @HttpCode(HttpStatus.OK)
  localLogout(): { success: boolean } {
    return { success: true };
  }
}
