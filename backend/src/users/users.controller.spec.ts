import { REQUIRED_PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { UsersController } from './users.controller';

describe('UsersController authorization', () => {
  const prototype = UsersController.prototype as unknown as Record<string, object>;

  it.each([
    ['list'],
    ['create'],
    ['update'],
  ])('requires usuarios.gerenciar (catalog slug, not the dead users.manage) on %s', (method) => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype[method]),
    ).toBe('usuarios.gerenciar');
  });
});
