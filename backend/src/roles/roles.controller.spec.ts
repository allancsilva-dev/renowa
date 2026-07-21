import { REQUIRED_PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { RolesController } from './roles.controller';

describe('RolesController authorization', () => {
  const prototype = RolesController.prototype as unknown as Record<string, object>;

  it.each([
    ['list'],
    ['create'],
    ['update'],
    ['remove'],
    ['updatePermissions'],
  ])('requires usuarios.gerenciar on %s', (method) => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype[method]),
    ).toBe('usuarios.gerenciar');
  });
});
