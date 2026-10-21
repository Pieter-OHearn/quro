import { describe, expect, it } from 'bun:test';
import { ssoErrorMessage } from './sso-error';

describe('ssoErrorMessage', () => {
  it.each(['denied', 'expired', 'failed', 'no_account', 'unverified_email', 'conflict', 'paused'])(
    'explains %s',
    (code) => {
      expect(ssoErrorMessage(code)).toBeTruthy();
    },
  );

  it('does not send people to a password that is turned off', () => {
    for (const code of ['denied', 'failed', 'no_account']) {
      expect(ssoErrorMessage(code, false)).not.toMatch(/password|invite/i);
    }
    expect(ssoErrorMessage('no_account', false)).toContain('create one for you');
    // The other reasons read the same in both modes.
    expect(ssoErrorMessage('expired', false)).toBe(ssoErrorMessage('expired'));
    expect(ssoErrorMessage('<script>', false)).toBeNull();
  });

  it('says nothing for no code or an unknown one', () => {
    expect(ssoErrorMessage(null)).toBeNull();
    expect(ssoErrorMessage('constructor')).toBeNull();
    expect(ssoErrorMessage('<script>')).toBeNull();
  });
});
