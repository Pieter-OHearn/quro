import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { NO_PASSWORD_HASH, hashPassword, verifyPassword } from './passwords';

describe('verifyPassword', () => {
  let spy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    spy?.mockRestore();
    spy = undefined;
  });

  test('accepts the password a hash was made from and nothing else', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batter', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  test.each([
    ['the empty hash of an account without a password', NO_PASSWORD_HASH],
    ['a missing hash', undefined],
    ['a null hash', null],
  ])('never matches %s, whatever the input', async (_label, hash) => {
    const inputs = ['', ' ', 'quro-dummy-password', 'null', 'undefined', '0', NO_PASSWORD_HASH];
    for (const input of inputs) expect(await verifyPassword(input, hash)).toBe(false);
  });

  test('does the work of a real check for an account without a password', async () => {
    spy = spyOn(Bun.password, 'verify');
    await verifyPassword('anything', NO_PASSWORD_HASH);
    await verifyPassword('anything', undefined);
    expect(spy).toHaveBeenCalledTimes(2);
    for (const [, stored] of spy.mock.calls as [string, string][]) {
      expect(stored).toMatch(/^\$2[aby]\$10\$/);
    }
  });

  test('hashes with bcrypt at cost 10', async () => {
    expect(await hashPassword('some password value')).toMatch(/^\$2[aby]\$10\$/);
  });
});
