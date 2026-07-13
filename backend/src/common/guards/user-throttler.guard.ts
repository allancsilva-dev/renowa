import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { RequestUser } from '../types/jwt-payload.type';

/**
 * CHANGELOG #11: Rate limiting por user.sub — não por IP.
 * Usuários autenticados são identificados pelo sub do JWT.
 * Fallback para IP em rotas públicas.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: RequestUser }): Promise<string> {
    return req.user?.sub ?? req.ip ?? 'anonymous';
  }
}
