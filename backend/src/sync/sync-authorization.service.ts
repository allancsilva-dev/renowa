import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PermissionsService } from '../permissions/permissions.service';
import { LocalUser } from '../rbac/entities/local-user.entity';
import { RequestUser } from '../common/types/jwt-payload.type';
import { SyncEntity, SyncItemDto, SyncItemV2Dto, SyncOperation } from './dto/sync.dto';
import { getSyncEntityPolicy } from './sync-entity-policy';

type SyncMutation = Pick<SyncItemDto | SyncItemV2Dto, 'entity' | 'operation'>;

@Injectable()
export class SyncAuthorizationService {
  private readonly logger = new Logger(SyncAuthorizationService.name);

  constructor(private readonly permissionsService: PermissionsService) {}

  async assertCanPush(
    items: readonly SyncMutation[],
    user: RequestUser,
    localUser?: LocalUser,
  ): Promise<void> {
    if (user.roles?.includes('SUPERADMIN')) return;
    if (!localUser || localUser.tenantId !== user.tenantId || !localUser.active) {
      throw new ForbiddenException('Acesso ao sync negado');
    }
    if (!localUser.roleId) throw new ForbiddenException('Acesso ao sync negado');

    const granted = new Set(await this.permissionsService.listEffectiveForRole(
      user.tenantId,
      localUser.roleId,
    ));
    const denied = new Set<string>();
    for (const item of items) {
      const required = this.permissionFor(item.entity, item.operation);
      if (!granted.has(required)) denied.add(`${item.entity}:${item.operation}`);
    }
    if (denied.size > 0) {
      this.logger.warn(JSON.stringify({
        event: 'sync_authorization_denied',
        userId: user.sub,
        tenantId: user.tenantId,
        denied: [...denied].sort(),
        itemCount: items.length,
      }));
      throw new ForbiddenException({
        message: 'Permissão insuficiente para mutações de sync',
        denied: [...denied].sort(),
      });
    }
  }

  permissionFor(entity: SyncEntity, operation: SyncOperation): string {
    const permissions = getSyncEntityPolicy(entity).permissions;
    switch (operation) {
      case SyncOperation.CREATE: return permissions.create;
      case SyncOperation.UPDATE: return permissions.update;
      case SyncOperation.DELETE: return permissions.delete;
    }
  }
}
