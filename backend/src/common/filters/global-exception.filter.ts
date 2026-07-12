import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * GlobalExceptionFilter — garante o padrão de erro em TODAS as respostas de erro.
 *
 * Formato:
 * {
 *   "error": {
 *     "code": "NOT_FOUND",
 *     "message": "Cliente não encontrado.",
 *     "timestamp": "2026-02-25T18:00:00.000Z"
 *   }
 * }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Erro interno do servidor.';
    let details: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        // ValidationPipe retorna { message: string[] | string, error: string }
        if (Array.isArray(resObj['message'])) {
          message = (resObj['message'] as string[]).join('; ');
        } else if (typeof resObj['message'] === 'string') {
          message = resObj['message'];
        }

        if (typeof resObj['code'] === 'string') {
          code = resObj['code'];
        }

        for (const key of ['resource', 'resourceId', 'expectedVersion', 'currentVersion']) {
          if (resObj[key] !== undefined) details[key] = resObj[key];
        }
      }

      if (code === 'INTERNAL_SERVER_ERROR') {
        code = this.httpStatusToCode(status);
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    } else {
      this.logger.error('Unhandled exception', String(exception));
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...details,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    });
  }

  private httpStatusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? 'HTTP_ERROR';
  }
}
