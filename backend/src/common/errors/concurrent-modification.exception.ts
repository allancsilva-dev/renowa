import { ConflictException } from '@nestjs/common';

export class ConcurrentModificationException extends ConflictException {
  constructor(resource: string, resourceId: string, expectedVersion: number, currentVersion: number) {
    super({
      statusCode: 409,
      code: 'CONCURRENT_MODIFICATION',
      message: 'Registro alterado por outro usuário.',
      resource,
      resourceId,
      expectedVersion,
      currentVersion,
    });
  }
}
