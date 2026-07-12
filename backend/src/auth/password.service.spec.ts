import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const svc = new PasswordService();

  it('hashes and verifies a correct password', async () => {
    const hash = await svc.hash('s3nha-forte');
    expect(hash).not.toContain('s3nha-forte');
    expect(await svc.verify(hash, 's3nha-forte')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await svc.hash('s3nha-forte');
    expect(await svc.verify(hash, 'errada')).toBe(false);
  });

  it('dummyVerify never throws (timing leveler)', async () => {
    await expect(svc.dummyVerify('qualquer')).resolves.toBeUndefined();
  });
});
