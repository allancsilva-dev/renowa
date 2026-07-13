import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { RequestUser } from '../common/types/jwt-payload.type';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';
import { PiiAuditAction, PiiAuditEvent } from './entities/pii-audit-event.entity';

export interface RecordPiiAuditInput {
  tenantId: string;
  actor: Pick<RequestUser, 'sub' | 'roles'>;
  action: PiiAuditAction;
  resourceType: string;
  resourceUuid?: string | null;
  fields?: string[];
  purpose: string;
  metadata?: Record<string, string | number | boolean>;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(PiiAuditEvent) private readonly repo: Repository<PiiAuditEvent>) {}

  async record(input: RecordPiiAuditInput, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(PiiAuditEvent) ?? this.repo;
    await repo.insert({
      tenant_id: input.tenantId,
      actor_id: input.actor.sub,
      actor_roles: input.actor.roles,
      action: input.action,
      resource_type: input.resourceType,
      resource_uuid: input.resourceUuid ?? null,
      fields: [...new Set(input.fields ?? [])].sort(),
      purpose: input.purpose,
      correlation_id: null,
      metadata: input.metadata ?? {},
    });
  }

  async list(tenantId: string, query: ListAuditEventsDto) {
    const qb = this.repo.createQueryBuilder('event').where('event.tenant_id = :tenantId', { tenantId });
    if (query.action) qb.andWhere('event.action = :action', { action: query.action });
    if (query.resourceType) qb.andWhere('event.resource_type = :resourceType', { resourceType: query.resourceType });
    if (query.actorId) qb.andWhere('event.actor_id = :actorId', { actorId: query.actorId });
    const [data, total] = await qb.orderBy('event.occurred_at', 'DESC')
      .skip((query.page - 1) * query.limit).take(query.limit).getManyAndCount();
    return { data, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }
}
