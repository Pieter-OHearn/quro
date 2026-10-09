import { describe, expect, it } from 'bun:test';
import type { SignUpFormValues } from '../types';
import { validatePasswordReset, validateSignUp } from './validation';

const completeSignUp: SignUpFormValues = {
  firstName: 'Ada',
  lastName: 'Example',
  email: 'ada@example.test',
  currentAge: '35',
  retirementAge: '67',
  password: 'long-enough-1',
  confirm: 'long-enough-1',
  inviteCode: '',
};

describe('validateSignUp', () => {
  it('requires a code only when the instance asks for one', () => {
    expect(validateSignUp(completeSignUp)).toEqual({});
    expect(validateSignUp(completeSignUp, { requireCode: false })).toEqual({});
    expect(validateSignUp(completeSignUp, { requireCode: true })).toEqual({
      inviteCode: 'Enter the code from your Quro operator',
    });
    expect(
      validateSignUp({ ...completeSignUp, inviteCode: ' ABCDE ' }, { requireCode: true }),
    ).toEqual({});
  });
});

describe('validatePasswordReset', () => {
  it('needs a code, a long enough password and a matching confirmation', () => {
    expect(validatePasswordReset({ code: '', nextPassword: 'short', confirm: 'other' })).toEqual({
      code: 'Enter the reset code from your Quro operator',
      nextPassword: 'At least 8 characters',
      confirm: "Passwords don't match",
    });
    expect(
      validatePasswordReset({
        code: 'ABCDE-FGHJK-MNPQR-STVWX',
        nextPassword: 'long-enough-1',
        confirm: 'long-enough-1',
      }),
    ).toEqual({});
  });
});
