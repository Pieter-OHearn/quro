# Security Model

Quro is designed for home LAN deployment over plain HTTP. There is no public internet exposure and no TLS termination. The mitigations described here are appropriate for that threat model — a trusted local network where the primary concern is session integrity and accidental data exposure, not adversarial attackers on a public network.

## Authentication

### Session-based auth

Authentication uses server-side sessions stored in the `sessions` table in PostgreSQL, not JWTs or tokens managed by the client. On sign-in or sign-up, the backend generates a 64-character hex session ID (32 random bytes from `crypto.getRandomValues`) and inserts a row into `sessions` with a 30-day expiry.

Two cookies are set:

| Cookie       | `httpOnly` | Purpose                                                  |
| ------------ | ---------- | -------------------------------------------------------- |
| `session`    | `true`     | Session ID — never readable by JavaScript                |
| `csrf_token` | `false`    | CSRF token — readable by JavaScript for header injection |

Both cookies are set with `sameSite: Lax` and `path: /`. The `secure` flag is controlled by the `SECURE_COOKIES` environment variable, which defaults to `false` for the HTTP-only LAN deployment.

On sign-out, the session row is deleted from the DB and both cookies are cleared.

### Password hashing

Passwords are hashed with bcrypt via `Bun.password.hash` at cost 10. Verification uses `Bun.password.verify`. The hash is stored in `users.password_hash`; the plaintext password is never persisted.

The minimum accepted password length is 8 characters, enforced at sign-up.

### Session validation

Every protected request goes through the `requireAuth` middleware, which:

1. Reads the `session` cookie.
2. Queries the `sessions` table by session ID.
3. Rejects the request if the session does not exist or `expires_at` is in the past.
4. Loads the user row and attaches `{ id, email }` to the Hono context.

All routes under `/api/*` except `/api/auth/*` and `/api/health` require a valid session.

### Session cleanup

Expired sessions accumulate in the `sessions` table until cleaned up. The application does not auto-purge sessions on a schedule in the current implementation; remove them manually with:

```sql
DELETE FROM sessions WHERE expires_at < NOW();
```

## CSRF Protection

### How it works

The CSRF protection uses the double-submit cookie pattern. On sign-in or sign-up, the backend sets a `csrf_token` cookie (not `httpOnly`, so JavaScript can read it). For every state-changing request, the Axios client reads this cookie and injects its value as an `X-CSRF-Token` request header. The `requireCsrf` middleware then verifies that the cookie value and the header value are non-empty and equal.

A cross-origin attacker cannot read the `csrf_token` cookie value (due to the same-origin policy), so they cannot forge the matching header.

### Exempt endpoints

Three endpoints are exempt from CSRF checking:

- `POST /api/auth/signin`
- `POST /api/auth/signup`
- `POST /api/auth/signout`

Signin and signup are exempt because the CSRF token does not exist yet when these requests are made — they are the requests that create it. Signout is exempt because it carries no user data and the worst-case consequence of a forced sign-out is losing a session, not a data mutation.

### Safe methods

`GET`, `HEAD`, and `OPTIONS` requests are always exempt — these methods do not modify server state.

### Client injection

`/packages/frontend/src/lib/api.ts` installs an Axios request interceptor that reads the `csrf_token` cookie and sets `X-CSRF-Token` on every non-safe request. The interceptor is a no-op if the cookie is absent (e.g., before the first sign-in).

## CORS

CORS is configured via the `CORS_ORIGIN` environment variable, which accepts a comma-separated list of allowed origins. The backend defaults to `http://localhost` and `http://localhost:5173` if no value is set.

Wildcard (`*`) origins are explicitly rejected at startup — using `*` with `credentials: true` is both unsafe and invalid per the Fetch spec. If `CORS_ORIGIN=*` is set, the backend logs a warning and falls back to the default list.

`credentials: true` is required because the session and CSRF cookies are sent as `HttpOnly`/`SameSite=Lax` cookies — the browser must include them on cross-origin requests to the backend in split-origin dev mode.

In the standard Docker deployment, the frontend Nginx container proxies `/api` to the backend, so all browser requests are same-origin and CORS headers are not exercised at runtime. CORS matters only in local development (`bun run dev`) where the frontend (`:5173`) and backend (`:3000`) are on different ports.

## Rate Limiting

Auth endpoints are rate-limited using an in-process sliding window counter keyed by the client IP address, resolved from `X-Real-IP` (set by Nginx) or `X-Forwarded-For`.

| Endpoint                | Window     | Max requests |
| ----------------------- | ---------- | ------------ |
| `POST /api/auth/signin` | 1 minute   | 5            |
| `POST /api/auth/signup` | 15 minutes | 3            |

Requests over the limit receive a `429 Too Many Requests` response. The limiter state is in-memory and resets if the backend restarts.

Rate limiting is disabled when `NODE_ENV=test`.

## Nginx Security Headers

The Nginx frontend container sets the following response headers on all requests:

**Content-Security-Policy**
Restricts what resources the browser will load. The policy allows scripts, styles, images, fonts, and `connect` only from the same origin (`'self'`). Inline styles are allowed (`'unsafe-inline'`) because Tailwind CSS 4 generates runtime styles. `frame-ancestors 'none'` prevents the app from being embedded in any iframe.

**X-Frame-Options: SAMEORIGIN**
Legacy framing control (complementary to the CSP `frame-ancestors` directive). Prevents the app from being embedded in an iframe on a different origin.

**X-Content-Type-Options: nosniff**
Tells the browser not to sniff the MIME type of responses. Prevents scripts from being executed if a response is served with an ambiguous content type.

**Referrer-Policy: strict-origin-when-cross-origin**
Sends the full URL as the `Referer` header on same-origin navigations, but only the origin (no path) on cross-origin requests. For a home app this is mostly a hygiene measure.

**X-XSS-Protection: 1; mode=block**
Enables the legacy XSS filter in older browsers. Modern browsers ignore this in favour of CSP, but it is harmless to include.

**Permissions-Policy: camera=(), microphone=(), geolocation=()**
Disables camera, microphone, and geolocation access for the page and any embedded frames. Quro does not use any of these browser APIs.

## Database Role Separation

Two PostgreSQL roles are used:

| Role                 | Environment variable  | Capabilities                                                                     |
| -------------------- | --------------------- | -------------------------------------------------------------------------------- |
| Admin (`quro_admin`) | `POSTGRES_ADMIN_USER` | Full DDL, `TRUNCATE`, migrations, backup/restore                                 |
| App (`quro_app`)     | `POSTGRES_APP_USER`   | Table-level `SELECT`, `INSERT`, `UPDATE`, `DELETE` — no schema DDL or `TRUNCATE` |

The `backend` and `pension-import-worker` containers connect as the app role. The admin role is used only by the `migrate` service (schema migrations and role bootstrap) and the `db-tools` service (backup, restore, manual SQL).

This limits the blast radius of an application-layer bug — the app role cannot drop tables, run migrations, or truncate data. Note that the app role currently retains `DELETE` privileges for normal application flows (e.g., deleting a pension pot), so row-level security or narrower write APIs would be required for stricter isolation.

## Network Isolation

The Docker Compose network topology isolates services:

- The `frontend` container (Nginx) is the only service with a host port binding (`80` by default). It sits on `frontend-net`.
- The `backend` container sits on both `frontend-net` (reachable by Nginx) and `backend-net` (reachable by DB and MinIO).
- PostgreSQL (`db`) and MinIO are on `backend-net` only — they are not reachable from the host or from the frontend container.
- The AI services (`vllm`, `pension-parser`) are on a separate `ai-net` alongside the `pension-import-worker`. The main backend cannot reach `vllm` or `pension-parser` directly.

This means that even if the frontend container were compromised, it has no direct network path to the database or object store.
