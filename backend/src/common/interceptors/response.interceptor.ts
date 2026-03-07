import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * ResponseInterceptor — envolve automaticamente toda resposta de sucesso no formato { data: ... }.
 *
 * Exceções:
 * - Respostas que já são { data: ... } ou { data: ..., meta: ... } são passadas sem re-envolver.
 * - Respostas null/undefined (ex: 204 No Content) são passadas sem alteração.
 * - Respostas de sync (server_time) são passadas sem re-envolver.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        // Deixa passar sem alterar se:
        // - é null/undefined (204 No Content)
        // - já tem a estrutura { data } ou { data, meta } ou { error }
        // - é resposta de sync ({ results, server_time } ou { data, meta, server_time })
        if (value === null || value === undefined) return value;

        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>;
          // Já está no formato correto
          if ('data' in obj || 'error' in obj) return value;
          // Resposta de sync com server_time
          if ('results' in obj && 'server_time' in obj) return { data: value };
        }

        return { data: value };
      }),
    );
  }
}
