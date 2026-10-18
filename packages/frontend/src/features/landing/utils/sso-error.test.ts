import { describe, expect, it } from 'bun:test';
import { ssoErrorMessage } from './sso-error';

describe('ssoErrorMessage', () => {
  it.each(['denied', 'expired', 'failed', 'no_account', 'unverified_email', 'conflict', 'paused'])(
    'explains %s',
    (code) => {
      expect(ssoErrorMessage(code)).toBeTruthy();
    },
  );

  it('says nothing for no code or an unknown one', () => {
    expect(ssoErrorMessage(null)).toBeNull();
    expect(ssoErrorMessage('constructor')).toBeNull();
    expect(ssoErrorMessage('<script>')).toBeNull();
  });
});
