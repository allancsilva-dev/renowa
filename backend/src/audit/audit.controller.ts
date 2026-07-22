import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AuditService } from './audit.service';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';

@Controller('admin/audit')
@RequirePermission('auditoria.ver')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListAuditEventsDto) {
    await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'AUDIT_READ',
      resourceType: 'pii_audit_event', purpose: 'Supervisão administrativa da trilha LGPD' });
    return this.audit.list(user.tenantId, query);
  }
}
