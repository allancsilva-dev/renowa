import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

/**
 * Injeta tenant_id automaticamente em todo INSERT.
 *
 * CHANGELOG #1: Funciona corretamente porque o CLS é populado pelo
 * TenantContextInterceptor (após o Guard), não no middleware.
 *
 * Lança erro se tenant_id estiver ausente — nunca insere sem tenant.
 *
 * NOTA: Alternativa mais explícita (recomendada para começar) é passar
 * tenantId diretamente nos métodos de service. Este subscriber é a opção
 * quando o projeto crescer e a verbosidade se tornar problemática.
 */
@Injectable()
@EventSubscriber()
export class TenantSubscriber implements EntitySubscriberInterface {
  constructor(
    dataSource: DataSource,
    private readonly cls: ClsService,
  ) {
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    if (!('tenant_id' in event.entity)) return;

    const tenantId = this.cls.get<string>('tenantId');

    if (!tenantId) {
      throw new Error(
        `TenantSubscriber: tenant_id ausente ao inserir ${event.metadata.tableName}. ` +
          'Verifique se o TenantContextInterceptor está registrado globalmente.',
      );
    }

    event.entity['tenant_id'] = tenantId;
  }
}
