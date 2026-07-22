import { REQUIRED_PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { PrivacyController } from './privacy.controller';

describe('PrivacyController authorization', () => {
  it('requires privacidade.gerenciar for every privacy endpoint', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, PrivacyController)).toEqual('privacidade.gerenciar');
  });
});
