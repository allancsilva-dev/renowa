import { REQUIRED_PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { AuditController } from './audit.controller';

describe('AuditController authorization', () => {
  it('requires auditoria.ver', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, AuditController)).toEqual('auditoria.ver');
  });
});
