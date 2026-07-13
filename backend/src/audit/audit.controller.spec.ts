import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { AuditController } from './audit.controller';

describe('AuditController authorization', () => {
  it('requires ADMIN role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditController)).toEqual(['ADMIN']);
  });
});
