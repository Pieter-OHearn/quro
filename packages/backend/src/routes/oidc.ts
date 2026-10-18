import { createMiddleware } from 'hono/factory';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getConfig } from '../config';
import { MS_PER_SECOND } from '../constants/time';
import { OidcError } from '../lib/oidcClient';
import { errorFields, log, type LogFields } from '../lib/logger';
import { maintenanceRequested } from '../lib/maintenanceMode';
import {
  LOGIN_ATTEMPT_TTL_MS,
  discardOidcLogin,
  finishOidcLogin,
  startOidcLogin,
  type OidcFailure,
} from '../lib/oidcLogin';
import { createSession, secureCookiesEnabled } from '../lib/sessions';
import { getClientAddress, oidcRateLimited } from '../middleware/rateLimit';

// Single sign-on with an OpenID Connect provider. Mounted only when the provider is configured.
// Both routes are public GETs that navigate the browser: `login` sends it to the provider and
// `callback` brings it back signed in, or to the landing page with `?sso=<reason>`.

const app = new Hono();

const ATTEMPT_COOKIE = 'oidc_attempt';
const ATTEMPT_COOKIE_PATH = '/api/auth/oidc';
const ATTEMPT_MAX_AGE_SECONDS = LOGIN_ATTEMPT_TTL_MS / MS_PER_SECOND;
// RFC 6749 4.1.2.1 error codes, such as `access_denied`.
const PROVIDER_ERROR = /^[a-z_]{1,40}$/;

function oidcSettings() {
  const { oidc } = getConfig();
  if (!oidc.enabled) throw new Error('Single sign-on is not configured');
  return {
    issuer: oidc.issuer,
    clientId: oidc.clientId,
    clientSecret: oidc.clientSecret.reveal(),
    redirectUri: oidc.redirectUri,
  };
}

// The class and, for a provider failure, the step that failed and a fixed description of it
// (OidcError never carries a token, a response body or an address).
function failureFields(error: unknown): LogFields {
  return error instanceof OidcError
    ? { ...errorFields(error), step: error.reason, detail: error.detail }
    : errorFields(error);
}

// The only values the browser is ever sent back with; the sign-in form has a message for each.
type SsoReason = OidcFailure | 'paused';

function back(c: Context, reason: SsoReason) {
  return c.redirect(`/welcome?sso=${reason}`);
}

// A browser that is refused lands back on the sign-in form with a reason, not on a JSON page.
// The routes are GETs, so the maintenance gate for writes does not see them: while a backup or a
// restore runs they refuse like the password sign-in does, instead of writing to the database.
const oidcGuard = createMiddleware(async (c, next) => {
  const address = getClientAddress(c);
  if (!address || oidcRateLimited(address)) return back(c, 'failed');
  try {
    if (await maintenanceRequested()) return back(c, 'paused');
  } catch (error) {
    log.error('oidc.gate_failed', errorFields(error));
    return back(c, 'failed');
  }
  await next();
});

app.get('/login', oidcGuard, async (c) => {
  try {
    const { browserToken, location } = await startOidcLogin(oidcSettings());
    setCookie(c, ATTEMPT_COOKIE, browserToken, {
      httpOnly: true,
      secure: secureCookiesEnabled(),
      sameSite: 'Lax',
      path: ATTEMPT_COOKIE_PATH,
      maxAge: ATTEMPT_MAX_AGE_SECONDS,
    });
    return c.redirect(location);
  } catch (error) {
    log.error('oidc.login_failed', failureFields(error));
    return back(c, 'failed');
  }
});

app.get('/callback', oidcGuard, async (c) => {
  const browserToken = getCookie(c, ATTEMPT_COOKIE);
  deleteCookie(c, ATTEMPT_COOKIE, { path: ATTEMPT_COOKIE_PATH });

  // The provider reports a refusal, such as a user who may not use Quro, with `error`.
  const providerError = c.req.query('error');
  if (providerError) {
    if (browserToken) await discardOidcLogin(browserToken);
    // Only a refusal is the person's to hear about; anything else is a fault for the operator.
    // The code is the provider's, but the query is anyone's: log it only if it has that shape.
    log.warn('oidc.provider_error', {
      providerError: PROVIDER_ERROR.test(providerError) ? providerError : 'other',
    });
    return back(c, providerError === 'access_denied' ? 'denied' : 'failed');
  }

  try {
    const result = await finishOidcLogin(oidcSettings(), {
      browserToken,
      state: c.req.query('state'),
      code: c.req.query('code'),
    });
    if (!result.ok) {
      log.warn('oidc.sign_in_refused', {
        reason: result.reason,
        ...(result.cause ? failureFields(result.cause) : {}),
      });
      return back(c, result.reason);
    }
    await createSession(c, result.userId);
    return c.redirect('/');
  } catch (error) {
    log.error('oidc.callback_failed', errorFields(error));
    return back(c, 'failed');
  }
});

export default app;
