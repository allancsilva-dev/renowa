import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';

/**
 * CHANGELOG #1/#10: Popula o CLS após o Guard — req.user já disponível aqui.
 *
 * Fluxo correto: Middleware → Guard (JWT validado) → Interceptor → Controller
 *
 * BUG EVITADO: Não usar middleware setup() para popular CLS, pois o Guard
 * ainda não rodou e req.user é undefined, resultando em tenant_id null.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { tenantId: string; sub: string } }>();
    const user = req.user;

    if (user) {
      this.cls.set('tenantId', user.tenantId);
      this.cls.set('userSub', user.sub);
    }

    return next.handle();
  }
}
