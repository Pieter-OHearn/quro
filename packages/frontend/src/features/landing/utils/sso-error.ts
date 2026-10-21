/** Where the backend sends the browser back to when a provider sign-in does not end in a session. */
export const SSO_ERROR_PARAM = 'sso';

const MESSAGES: Record<string, string> = {
  denied: 'The provider did not let you sign in. Try again, or sign in with your password.',
  expired: 'That sign-in took too long or started in another browser. Try again.',
  failed: 'Single sign-on failed. Try again, or sign in with your password.',
  no_account:
    'No Quro account uses your email address. Ask the operator of this Quro instance for an invite, then sign in again.',
  unverified_email: 'Your provider has not verified your email address, so Quro cannot match it.',
  paused: 'Quro is being backed up or restored. Try again in a minute.',
  conflict:
    'Your Quro account is already linked to a different identity at this provider. Ask the operator for help.',
};

// With passwords turned off there is no password to fall back on, and accounts come from the operator.
const SINGLE_SIGN_ON_ONLY_MESSAGES: Record<string, string> = {
  denied: 'The provider did not let you sign in. Try again.',
  failed: 'Single sign-on failed. Try again, or ask the operator of this Quro instance for help.',
  no_account:
    'No Quro account uses your email address. Ask the operator of this Quro instance to create one for you, then sign in again.',
};

/**
 * The message for an `sso` query value, or null when there is none or it is not one we know.
 * `passwordLogin` is false when the operator turned passwords off.
 */
export function ssoErrorMessage(code: string | null, passwordLogin = true): string | null {
  if (code === null || !Object.hasOwn(MESSAGES, code)) return null;
  if (!passwordLogin && Object.hasOwn(SINGLE_SIGN_ON_ONLY_MESSAGES, code)) {
    return SINGLE_SIGN_ON_ONLY_MESSAGES[code]!;
  }
  return MESSAGES[code]!;
}
