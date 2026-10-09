import { describe, expect, it } from 'bun:test';
import { signUpErrorField } from './auth-error';

describe('signUpErrorField', () => {
  it.each([
    ['An invite code from the operator of this Quro instance is required', 'inviteCode'],
    ['This code is invalid, expired or already used', 'inviteCode'],
    [
      'A setup code is required to create the first account. The operator issues one with `quro user invite` on the server.',
      'inviteCode',
    ],
    [
      'Registration is closed on this Quro instance. Ask its operator for an account.',
      'inviteCode',
    ],
    ['An account with this email already exists', 'email'],
    ['Too many requests, please try again later', 'email'],
  ])('%s -> %s', (message, field) => {
    expect(signUpErrorField(message)).toBe(field);
  });
});
