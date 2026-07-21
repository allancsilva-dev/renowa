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
 * - Respostas paginadas { data: ..., meta: ... } são passadas sem re-envolver.
 * - Respostas de erro { error: ... } são passadas sem re-envolver.
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
        // - já tem a estrutura paginada { data, meta } ou { error }
        // - é resposta de sync ({ results, server_time } ou { data, meta, server_time })
        if (value === null || value === undefined) return value;

        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>;
          // Paginado — não usa 'data' sozinho porque entidades como Pedido e
          // FinanceMovement têm uma coluna de domínio literalmente chamada 'data'.
          if ('data' in obj && 'meta' in obj) return value;
          if ('error' in obj) return value;
          // Resposta de sync push — passa sem re-envolver (mobile lê data.results diretamente)
          if ('results' in obj) return value;
        }

        return { data: value };
      }),
    );
  }
}
