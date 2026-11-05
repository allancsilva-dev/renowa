import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';
import { MarkReleaseNotesSeenDto } from './dto/mark-release-notes-seen.dto';
import { REQUIRED_PERMISSION_KEY } from '../common/decorators/require-permission.decorator';
import { UsersController } from './users.controller';

function makeService(localUserRepo: Record<string, jest.Mock>) {
  return new UsersService(
    {} as any, localUserRepo as any, {} as any, {} as any,
    new PasswordService(), {} as any, {} as any,
  );
}

describe('UsersService — Novidades', () => {
  it('devolve versão vista e data de criação do próprio usuário no tenant', async () => {
    const findOne = jest.fn().mockResolvedValue({
      id: 7, releaseNotesSeenVersion: '1.2.0', createdAt: new Date('2026-01-10T12:00:00Z'),
    });
    const service = makeService({ findOne });

    await expect(service.getReleaseNotesState({ authUserId: 'auth-1', tenantId: 't-1' }))
      .resolves.toEqual({ supported: true, seenVersion: '1.2.0', createdAt: '2026-01-10T12:00:00.000Z' });
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { authUserId: 'auth-1', tenantId: 't-1' },
    }));
  });

  it('nunca viu nenhuma versão → seenVersion null', async () => {
    const service = makeService({
      findOne: jest.fn().mockResolvedValue({ id: 7, releaseNotesSeenVersion: null, createdAt: new Date() }),
    });
    const state = await service.getReleaseNotesState({ authUserId: 'a', tenantId: 't' });
    expect(state).toMatchObject({ supported: true, seenVersion: null });
  });

  it('sem local_users (ou sem tenant) → supported false, sem consultar banco à toa', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const service = makeService({ findOne });

    await expect(service.getReleaseNotesState({ authUserId: 'a', tenantId: 't' }))
      .resolves.toMatchObject({ supported: false });
    await expect(service.getReleaseNotesState({ authUserId: 'a', tenantId: null }))
      .resolves.toMatchObject({ supported: false });
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('grava só no próprio usuário do tenant do token', async () => {
    const update = jest.fn().mockResolvedValue({ affected: 1 });
    const service = makeService({ update });

    await service.markReleaseNotesSeen({ authUserId: 'auth-1', tenantId: 't-1', version: '1.3.0' });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      { authUserId: 'auth-1', tenantId: 't-1' },
      { releaseNotesSeenVersion: '1.3.0' },
    );
  });

  it('sem tenant → no-op', async () => {
    const update = jest.fn();
    await makeService({ update }).markReleaseNotesSeen({ authUserId: 'a', tenantId: null, version: '1.0.0' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('MarkReleaseNotesSeenDto', () => {
  it.each(['1.0.0', '10.20.300'])('aceita %s', async (version) => {
    expect(await validate(plainToInstance(MarkReleaseNotesSeenDto, { version }))).toHaveLength(0);
  });

  it.each(['', '1.0', 'v1.0.0', '1.0.0-beta', '1.0.0; drop', 123, undefined, '1'.repeat(30) + '.0.0'])(
    'rejeita %p',
    async (version) => {
      expect((await validate(plainToInstance(MarkReleaseNotesSeenDto, { version }))).length).toBeGreaterThan(0);
    },
  );
});

describe('UsersController — rotas de Novidades', () => {
  const prototype = UsersController.prototype as unknown as Record<string, object>;
  it.each(['releaseNotesState', 'markReleaseNotesSeen'])('%s não exige permissão extra', (method) => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, prototype[method])).toBeUndefined();
  });
});
