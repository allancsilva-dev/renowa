import { ForbiddenException } from '@nestjs/common';
import { SyncController } from './sync.controller';
import { SyncEntity, SyncOperation } from './dto/sync.dto';

describe('SyncController push authorization boundary', () => {
  const syncService = { pushItems: jest.fn(), pushItemsV2: jest.fn() };
  const authorization = { assertCanPush: jest.fn() };
  const controller = new SyncController(syncService as never, authorization as never);
  const user = { tenantId: 'tenant-a', roles: ['manager'] } as never;
  const localUser = { tenantId: 'tenant-a', active: true, roleId: 2 };
  const item = {
    uuid: '5a14df36-7bd1-407c-b86e-3fefadf0d950',
    entity: SyncEntity.CLIENTES,
    operation: SyncOperation.UPDATE,
    payload: { razao_social: 'Cliente' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    authorization.assertCanPush.mockResolvedValue(undefined);
    syncService.pushItems.mockResolvedValue({ results: [] });
    syncService.pushItemsV2.mockResolvedValue({ results: [] });
  });

  it('authorizes the complete v1 batch before writing', async () => {
    const dto = { items: [item] };
    await controller.push(dto, user, { localUser } as never);
    expect(authorization.assertCanPush).toHaveBeenCalledWith(dto.items, user, localUser);
    expect(authorization.assertCanPush.mock.invocationCallOrder[0])
      .toBeLessThan(syncService.pushItems.mock.invocationCallOrder[0]);
    expect(syncService.pushItems).toHaveBeenCalledWith(dto.items, 'tenant-a');
  });

  it('does not write any v1 item after authorization denial', async () => {
    authorization.assertCanPush.mockRejectedValue(new ForbiddenException());
    await expect(controller.push({ items: [item] }, user, { localUser } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(syncService.pushItems).not.toHaveBeenCalled();
  });

  it('does not write any v2 item after authorization denial', async () => {
    authorization.assertCanPush.mockRejectedValue(new ForbiddenException());
    const dto = {
      device_id: 'df791468-d4f8-4701-8d79-8cedeadab812',
      items: [{ ...item, operation_id: '31a10ba0-c248-42ff-8093-c58ac0ab95cf', base_version: 1 }],
    };
    await expect(controller.pushV2(dto, user, { localUser } as never))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(syncService.pushItemsV2).not.toHaveBeenCalled();
  });
});
