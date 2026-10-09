import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasswordResetHelp } from './PasswordResetForm';
import { InviteCodeField, RegistrationClosedNotice } from './RegistrationNotices';

function renderCodeField(policy: Parameters<typeof InviteCodeField>[0]['policy']) {
  return renderToStaticMarkup(<InviteCodeField policy={policy} value="" onChange={() => {}} />);
}

describe('InviteCodeField', () => {
  it('asks for a setup code and names the operator command on a new instance', () => {
    const markup = renderCodeField({ signUp: 'code', setupRequired: true });
    expect(markup).toContain('Setup code');
    expect(markup).toContain('quro user invite');
    expect(markup).toContain('*');
  });

  it('asks invited users for their code once the instance is set up', () => {
    const markup = renderCodeField({ signUp: 'code', setupRequired: false });
    expect(markup).toContain('Invite code');
    expect(markup).toContain('single-use invite code');
    expect(markup).not.toContain('quro user invite');
  });

  it('stays optional while the policy is unknown', () => {
    const markup = renderCodeField(undefined);
    expect(markup).toContain('Only needed if');
    expect(markup).not.toContain('*');
  });
});

describe('RegistrationClosedNotice', () => {
  it('explains that sign-ups are closed and still offers sign-in', () => {
    const markup = renderToStaticMarkup(<RegistrationClosedNotice onSwitchToSignIn={() => {}} />);
    expect(markup).toContain('Registration is closed');
    expect(markup).toContain('Ask its operator');
    expect(markup).toContain('Sign in');
  });
});

describe('PasswordResetHelp', () => {
  it('explains the operator recovery path without email', () => {
    const markup = renderToStaticMarkup(<PasswordResetHelp />);
    expect(markup).toContain('does not send email');
    expect(markup).toContain('quro user reset-password');
    expect(markup).toContain('expires after an hour');
  });
});
