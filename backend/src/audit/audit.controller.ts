import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequestUser } from '../common/types/jwt-payload.type';
import { AuditService } from './audit.service';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';

@Controller('admin/audit')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListAuditEventsDto) {
    await this.audit.record({ tenantId: user.tenantId, actor: user, action: 'AUDIT_READ',
      resourceType: 'pii_audit_event', purpose: 'Supervisão administrativa da trilha LGPD' });
    return this.audit.list(user.tenantId, query);
  }
}
