import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { PrivacyController } from './privacy.controller';

describe('PrivacyController authorization', () => {
  it('requires ADMIN role for every privacy endpoint', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PrivacyController)).toEqual(['ADMIN']);
  });
});
