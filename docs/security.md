# Security Model

This document is Quro's threat model. It says which deployments are supported, what protects
each of them, what the operator is trusted with, and which risks Quro accepts. It is a
risk-selected baseline, not a claim of conformance with any standard. To report a weakness, follow
[SECURITY.md](../SECURITY.md).

## Scope and trust

Quro holds a household's financial records: balances, transactions, payslips, pension statements
and the documents attached to them, plus the credentials of any connected bank.

| Who                                              | Trusted with                                         | Quro protects against them?                                              |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Account holders                                  | Their own rows, and an accepted partner's joint rows | Yes: access is checked per row on the backend                            |
| Other devices on the network or the internet     | Nothing                                              | Yes: authentication, CSRF, rate limits, the modes below                  |
| The instance operator (host, Docker, `quro` CLI) | Configuration, secrets, accounts and recovery        | No. The operator can read every row; see [Operator role](#operator-role) |
| Host, database and object-storage administrators | Everything stored                                    | No                                                                       |

Out of scope: a compromised host or container runtime, physical access to the server, malware or
extensions in the user's browser, and anyone who holds the backups or the secret files. Image and
dependency supply chain checks are tracked separately.

## Deployment modes

Quro supports two deployment modes. Both use the bundled nginx (`packages/frontend/nginx.conf`) in
front of the backend, and both are covered by
`packages/backend/src/routes/deploymentModes.integration.test.ts`.

| Mode | Browsers connect to                                   | Transport                                | `SECURE_COOKIES` | `TRUSTED_PROXIES`                                              |
| ---- | ----------------------------------------------------- | ---------------------------------------- | ---------------- | -------------------------------------------------------------- |
| A    | The bundled nginx, on a private network               | Plain HTTP                               | `false`          | Compose default `172.16.0.0/12`                                |
| B    | The operator's reverse proxy, which forwards to nginx | HTTPS to the proxy, HTTP inside the host | `true`           | The nginx network, plus the proxy's address if it is elsewhere |

Mode A is the default for new installs. The app does not enforce TLS in either mode.

### Mode A: HTTP on a private network

Browsers on the home network open `http://<host>:3000` and talk to nginx directly. Traffic,
including passwords and session cookies, is not encrypted, so anyone who can observe the network
can take over a session. Use mode A only on a network where every device is trusted, and do not
forward the port to the internet.

### Mode B: HTTPS behind your reverse proxy

A reverse proxy you run (Caddy, Traefik, nginx or similar) terminates TLS and forwards to the
bundled nginx, which proxies `/api` to the backend: browser → TLS proxy → nginx → backend.

1. Set `SECURE_COOKIES=true`, so browsers only send the session cookie over HTTPS.
2. Set `TRUSTED_PROXIES` so rate limits apply per browser. See [Proxy trust](#proxy-trust).
3. Add HSTS and an HTTP-to-HTTPS redirect at your proxy. The bundled nginx serves plain HTTP and
   cannot set them.
4. Keep browsers from reaching nginx's published port directly, for example with a firewall rule,
   or by publishing it on `127.0.0.1` when the proxy runs on the same host. Otherwise the instance
   is also reachable over plain HTTP.

### Configuration mistakes the backend reports

`SECURE_COOKIES` is configuration. The backend never derives it from `X-Forwarded-Proto` or any
other header a client can send. Two mistakes would otherwise fail silently, so the backend logs a
`[config]` warning, once per process, when it sees them:

- `SECURE_COOKIES=false` while browsers use HTTPS: session cookies lack the `Secure` flag.
- `SECURE_COOKIES=true` while browsers use plain HTTP: browsers drop the cookie and sign-in does
  not stick. Loopback addresses are exempt, because browsers keep `Secure` cookies there.

The backend checks `FRONTEND_ORIGIN` at startup when it is set, and the `Origin` header of
sign-in, sign-up and password reset requests. Browsers send `Origin` on every `POST` and proxies
pass it through unchanged, so it shows the scheme the browser uses even behind two proxies.
Any client can send an `Origin` header, though, so a warning based on one says so: confirm how
browsers reach Quro before changing the setting. Unknown `SECURE_COOKIES` and `QRO_REGISTRATION_MODE`
values stop the backend at startup, together with every other invalid setting in one list.

### Not supported

- Publishing the backend port, or routing a proxy to the backend without the bundled nginx. The
  backend still enforces authentication, CSRF and rate limits (see
  [Direct access to the backend](#direct-access-to-the-backend)), but nginx's security headers and
  its 25 MB request limit no longer apply.
- Plain HTTP over the internet.
- Serving Quro under a path prefix, or on a hostname shared with another application. Browsers
  send cookies to every port of a hostname, so another application there would receive Quro's
  session cookie.

## Cookies, CSRF and CORS

### Cookies

Sign-in, sign-up and password reset set two cookies, both with `SameSite=Lax`, `Path=/` and a
30-day `Max-Age`:

| Cookie       | `HttpOnly` | Purpose                                                    |
| ------------ | ---------- | ---------------------------------------------------------- |
| `session`    | `true`     | 256-bit random session token, never readable by JavaScript |
| `csrf_token` | `false`    | CSRF token, read by the frontend and echoed in a header    |

Both carry `Secure` when `SECURE_COOKIES=true` (mode B) and not otherwise (mode A). The bunq OAuth
state cookie follows the same setting.

### CSRF protection

State-changing requests use the double-submit pattern. The Axios client in
`packages/frontend/src/lib/api.ts` copies the `csrf_token` cookie into an `X-CSRF-Token` header on
every non-`GET` request, and `packages/backend/src/middleware/csrf.ts` rejects the request with
`403` unless both are present and equal. Another site cannot read the cookie, so it cannot forge the
header. `GET`, `HEAD` and `OPTIONS` requests are exempt and never change state.

The public auth endpoints run before a CSRF token exists:

- `POST /api/auth/signin`, `POST /api/auth/signup` and `POST /api/auth/password-reset` accept
  only `Content-Type: application/json` and otherwise return `415`. A cross-site form can only
  send form or text bodies, and a cross-site JSON request needs a CORS preflight that the backend
  does not grant, so other sites cannot sign a browser in to an account of their choosing.
- `POST /api/auth/signout` takes no body. A forced sign-out only loses a session.

### CORS

In both modes the browser loads the app and calls `/api` on the same origin through nginx, so CORS
is not used. `CORS_ORIGIN` lists origins for split-origin development (Vite on `:5173`, backend on
`:3000`) and defaults to `http://localhost:3000,http://localhost:5173`. Responses to any other
origin carry no `Access-Control-Allow-Origin`, so another site's script cannot read API responses
or send credentialed requests with custom headers. A wildcard `CORS_ORIGIN=*` is rejected at
startup in favour of the defaults, because credentials require explicit origins.

### Proxy trust

Rate limits are keyed on the client address. The backend reads the direct peer from the socket and
uses `X-Forwarded-For` or `X-Real-IP` only when that peer is listed in `TRUSTED_PROXIES`
(comma-separated IPs or IPv4 CIDRs; unset trusts none). Behind trusted proxies it takes the
right-most `X-Forwarded-For` hop that is not itself trusted, so a client cannot choose its own key
by adding hops on the left. If the peer address is unknown, the request fails with `503`. Malformed
entries stop the backend at startup.

The bundled nginx overwrites `X-Real-IP` with its peer and appends its peer to `X-Forwarded-For`:

- **Mode A**: the backend's peer is nginx and nginx's peer is the browser. The Compose default
  `172.16.0.0/12` is Docker's default network range, which covers nginx. If your home network
  itself uses `172.16.0.0/12` addresses, set `TRUSTED_PROXIES` to the Compose network's subnet
  instead (`docker network inspect` shows it). Releases up to 0.7.0 defaulted to every private
  range; if you copied that value into your configuration, replace it.
- **Mode B**: nginx's peer is your TLS proxy. If the proxy runs on the Docker host or in a Docker
  network, nginx sees a `172.16.0.0/12` address and the default works. If it runs on another
  machine, add its address, for example `TRUSTED_PROXIES=172.16.0.0/12,192.168.1.10`. If Docker
  uses custom address pools, list those subnets instead. If you run your own Compose file,
  `TRUSTED_PROXIES` has no default: set it, or every browser shares nginx's rate-limit bucket.

`X-Forwarded-Proto` is informational. nginx sets it to its own scheme, `http`, in both modes.

### Direct access to the backend

Compose publishes only nginx; the backend has no host port and shares a network only with nginx.
`scripts/compose-topology.test.ts` keeps it that way. If something does reach the backend
directly:

- Authentication, CSRF checks and per-row access checks run in the backend and do not depend on
  nginx or on forwarded headers. Headers such as `X-Forwarded-User` are ignored.
- Forwarded headers from a peer outside `TRUSTED_PROXIES` are ignored, so the client is keyed by
  its own address.
- `X-Forwarded-Proto: https` does not add `Secure` to cookies.
- nginx's security headers and request size limit do not apply. The backend serves only JSON.

## Accounts and registration

### First account

A new instance has no accounts and no default credentials. Creating the first account needs a
one-time setup code from the operator, in every registration mode:

```bash
docker compose exec backend quro user invite
```

So whoever reaches a fresh instance first cannot claim it. Sign-ups are serialised with a
PostgreSQL advisory lock, and a code is consumed in the same transaction that creates the account,
so concurrent sign-ups cannot create two first accounts or use one code twice
(`packages/backend/src/lib/registration.integration.test.ts`).

### Registration modes

`QRO_REGISTRATION_MODE` decides who may sign up once the first account exists:

| Value              | Sign-up after the first account                                     |
| ------------------ | ------------------------------------------------------------------- |
| `invite` (default) | A single-use code from `quro user invite`, valid 7 days by default  |
| `closed`           | Refused, even with a valid code                                     |
| `open`             | Anyone who can reach the instance; opt in only on a trusted network |

`GET /api/auth/registration` tells the sign-up form whether a code is needed and whether setup is
pending. It reveals only that an instance has no accounts yet, which a visitor cannot use without a
code.

### Account enumeration

Sign-in returns the same error, after the same password hashing work, whether or not the email
exists. Sign-up checks the code before the email, so in the default `invite` mode only someone
holding a valid code learns that an address is already registered, and the code stays unused. In
`open` mode sign-up reveals it. Quro keeps that message because the household is small and the
person signing up needs to know why it failed; the sign-up rate limit bounds probing.

## Sessions

- Session tokens are 256 random bits. The `sessions` table stores only their SHA-256 digest, so a
  database dump or backup does not contain a usable cookie. A check constraint rejects anything
  but a digest.
- A session lasts 30 days from sign-in. There is no idle timeout. Expired rows are rejected on use
  and purged daily by `startSessionCleanup()` in `packages/backend/src/lib/sessionCleanup.ts`
  (`SESSION_CLEANUP_INTERVAL_MS` changes the interval).
- Each session records the browser's user agent (truncated to 256 characters) and when it was
  last used, refreshed at most every 5 minutes.
- **Settings → Security** lists the account's sessions. The user can sign out one browser or every
  other browser.
- Changing the password signs out every other session. A password reset signs out all of them.
- Sessions are deleted with their account.

Upgrading from 0.7.0, migration `0038` replaces each stored token with its digest. Browsers stay
signed in.

## Operator recovery without email

Quro sends no email. The operator recovers accounts with the `quro` command in the backend
container, which uses the backend's database credentials:

```bash
docker compose exec backend quro user --help
```

| Command                           | Effect                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `quro user status`                | Registration mode, whether setup is pending, account and unused code counts        |
| `quro user invite [--hours N]`    | Issues a registration code (7 days by default, at most 30)                         |
| `quro user reset-password EMAIL`  | Issues a password reset code for the account (1 hour by default, at most 24 hours) |
| `quro user revoke-sessions EMAIL` | Signs the account out of every browser                                             |
| `quro user list`                  | Accounts with their creation time and active session count                         |
| `quro user codes`                 | Issued codes and whether they were used; code values are never stored              |
| `quro user revoke-code ID`        | Withdraws an unused code                                                           |

Codes are 24 Crockford base32 characters (120 bits) in four groups of six, shown once and stored
only as a SHA-256 digest. They are single-use, expire, and tolerate lowercase, spaces and the
look-alikes `I`, `L` and `O`. A new reset code replaces the account's previous one. The user redeems
a reset code with **Forgot password?** on the sign-in screen, which sets the new password, ends
every session and signs them in. Used and expired codes are deleted after 30 days. Reset requests are
rate limited per client address.

For a local development backend, run the same commands with
`bun run --filter '@quro/backend' quro user <command>`.

### Operator role

Quro has no in-app operator or administrator role. Instance operations (accounts, codes,
sessions, and later diagnostics) are CLI-only. Operator authority comes from access to the host and
the backend container, which already includes the database credentials, so an in-app role would
add an attack surface without reducing what the operator can do. The CLI prints account metadata
(email, creation time, session counts) and never household or financial data. Host and database
administrators remain fully trusted.

## Keys and credentials

| Secret                                    | Stored in                                       | In a database dump? | If it is lost                                                        |
| ----------------------------------------- | ----------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| PostgreSQL admin and app passwords        | `secrets/*.txt` (Docker secrets)                | No                  | Set new ones in the files and the database as the database superuser |
| S3 secret access key, with S3 storage     | The file `S3_SECRET_ACCESS_KEY_FILE` names      | No                  | Issue a new key in the store; documents are unaffected               |
| The store's encryption key, if it has one | Your S3 store's configuration                   | No                  | The stored documents cannot be read                                  |
| bunq OAuth client secret                  | `BUNQ_CLIENT_SECRET`                            | No                  | Issue a new one in bunq and update the configuration                 |
| Backup encryption key                     | The file `QRO_BACKUP_ENCRYPTION_KEY_FILE` names | No                  | Encrypted archives cannot be restored; keep a copy apart from them   |
| bunq access tokens and keys               | Database (`bunq_connections`)                   | **Yes**             | Reconnect bunq in Settings                                           |
| User passwords                            | Database, as bcrypt hashes                      | Yes, as hashes      | `quro user reset-password`                                           |
| Session tokens                            | Browser cookie; database holds the digest       | Digest only         | Sign in again                                                        |
| Registration and reset codes              | Shown once; database holds the digest           | Digest only         | Issue a new code                                                     |

Rules that follow from this table:

- A database dump or backup archive contains bank tokens and financial records. Store it as
  carefully as the live instance, and encrypt archives that leave the machine. See
  [backup and restore](backup-and-restore.md).
- The secret files are not in a dump. Back them up separately, somewhere only the operator can
  read, and not next to the dumps.
- Restoring a dump restores the sessions that existed when it was taken. Run
  `quro user revoke-sessions` for affected accounts if that matters.
- Integration secrets are to be encrypted at rest with one operator-held key (see the
  [roadmap](../ROADMAP.md)). Keep that key with the secret files, never inside a dump. Losing it
  means reconnecting bunq; all other data stays intact.

## Authorization and privacy tests

Access is "your rows, plus an accepted partner's rows that are flagged joint". Only savings
accounts, properties and mortgages, with their transactions, can be joint. Everything else
(holdings, pensions, debts, payslips, goals, budget, imports and documents) is visible to its
owner alone. Every request is authorised against the session on the backend; the frontend hides
nothing that the API would serve.

### What a caller sees

| Situation                                                         | Answer                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| No session, a tampered cookie or an expired session               | `401`, before any row is looked up                                         |
| State change without the CSRF header                              | `403`, before authentication                                               |
| An id that belongs to someone else, or to no one                  | The same `404` and the same body for both; no way to tell them apart       |
| A foreign parent named in a body (account, mortgage, employment…) | The same refusal as a parent that does not exist                           |
| A collection filtered by a foreign parent id                      | Shareable tables: `404`. Other tables: an empty list. Same as a missing id |
| A refused request                                                 | Changes nothing that is stored                                             |
| A value the database cannot store (NUL character, huge number)    | `400` with a fixed message                                                 |
| Any other server failure                                          | `500` with a fixed message; details go to the server log only              |

An accepted partner can edit and archive joint rows, as the owner can. A pending invitation, a
link that has ended and a link to someone else grant nothing. Ending a link clears the joint flag
on both members' rows, and the other member's open session loses access on its next request.

### What the tests prove

`packages/backend/src/routes/accessMatrix.integration.test.ts` builds four households on a
throwaway database: an owner with an accepted partner, an unrelated household, a former partner
(linked with joint rows, then unlinked through the API) and a pending, never accepted, invitation.
Every row carries a marker, and each route is run as every kind of actor against every kind of
row. It asserts that:

- each registered route is either in the case table (`accessMatrix.cases.ts`) or exempt there with
  a reason, so a new route cannot ship unclassified;
- a denied request gets exactly the answer an id that does not exist gets;
- no denied request changes any stored row (a snapshot of every household table is compared);
- no collection or error body contains another household's marker, and no response, even the
  owner's, contains a stored bank credential;
- the owner, and the partner on joint rows, succeed with the same requests, so the denials are not
  vacuous;
- every protected route answers `401` without a session, and the public paths are exactly the
  list in `lib/publicPaths.ts`.

Other suites cover what the matrix does not:

| Suite                                              | Covers                                                                                                                 |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sessionAndHouseholdLifecycle.integration.test.ts` | Sign-out, expiry, account switching, unlinking and invitations, the nightly net-worth job and the statement import job |
| `dynamicDeployment.integration.test.ts`            | A real backend process with rate limits on: brute-force limits, CSRF, CORS, cookie flags, stored markup, error text    |
| `malformedRequests.integration.test.ts`            | Wrong types, sizes and shapes sent to every JSON route; ids that are not integers                                      |
| `lib/accessSweep.test.ts`                          | The inventory of owner predicates written inline instead of through `lib/access.ts`                                    |
| `packages/frontend/src/lib/authBoundary.test.tsx`  | Sign-in, sign-up, recovery, sign-out and a late response all leave the query cache empty                               |

The dynamic suite starts the backend with its outbound proxy pointed at a closed port, so it
cannot reach a provider. No test uses real data or a provider.

### Owner predicates outside `lib/access.ts`

`lib/access.ts` and `lib/partner.ts` define access for rows that can be shared. Tables that cannot
be shared are queried with `eq(table.userId, …)` directly, which is correct while sharing is
limited to the tables above. `accessSweep.test.ts` records every such predicate by file and table
(148 in 26 files) and fails when a new one appears or when one touches a shareable table without
a recorded reason. The three recorded exceptions are ending a link, a goal that follows a savings
account its owner holds, and the bank sync writing the connected user's own accounts. Changing the
sharing model means revisiting this list.

### Known limits

- An invitation names an account by email, so the error for an unknown address (`404`) differs
  from the one for an address that already has a link (`409`). Invitations are limited to 10 per
  15 minutes per user.
- Net-worth history months that were stored while a link existed keep their values after it ends.
  The current month is always computed from the rows the user can see.
- The partner who did not end the link keeps whatever their browser cached until the next
  refetch (five minutes, or sooner on window focus). The API refuses the old rows at once.
- Bank sync, the stock price job and session cleanup act on a user id taken from the database.
  Their queries are in the inventory, but they are not exercised as separate callers.
- Text fields have no length limit in the backend; nginx caps a request at 25 MB.

## OWASP ASVS 5.0 baseline

A risk-selected subset of [ASVS 5.0](https://github.com/OWASP/ASVS/tree/master/5.0), mostly level
1 with the level 2 controls a self-hosted finance app needs. "Gap" marks accepted or planned work.
Passing tests and scanners is evidence for the listed controls only.

| Requirement                                                | Status   | How Quro meets it, or why not                                                                                                                     |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.3.1 Secure cookie attribute                              | Partial  | Mode B sets `Secure`. Mode A is plain HTTP by design. No `__Host-` prefix yet                                                                     |
| 3.3.2 SameSite, 3.3.4 HttpOnly                             | Met      | `SameSite=Lax` on both cookies; `HttpOnly` on the session cookie                                                                                  |
| 3.4.1 HSTS                                                 | Operator | Mode B: set at the operator's TLS proxy                                                                                                           |
| 3.5.1 Anti-forgery tokens                                  | Met      | Double-submit CSRF token on every state-changing request                                                                                          |
| 3.5.2 Preflight for sensitive requests                     | Met      | Custom CSRF header and JSON-only public endpoints; no CORS grant to other origins                                                                 |
| 3.5.3 Safe methods do not change state                     | Met      | Except the bunq OAuth redirects, which OAuth requires to be `GET`                                                                                 |
| 6.1.1, 6.3.1 Brute-force controls documented               | Met      | [Rate limiting](#rate-limiting)                                                                                                                   |
| 6.2.1 Minimum password length                              | Met      | 8 characters                                                                                                                                      |
| 6.2.2, 6.2.3 Password change with current password         | Met      | Settings → Security                                                                                                                               |
| 6.3.2 No default accounts                                  | Met      | First account needs an operator setup code                                                                                                        |
| 6.3.8 No account enumeration (level 3)                     | Partial  | See [Account enumeration](#account-enumeration)                                                                                                   |
| 6.4.1 Issued secrets expire and are single-use             | Met      | Registration codes 7 days, reset codes 1 hour, both single-use                                                                                    |
| 6.4.2 No password hints or security questions              | Met      |                                                                                                                                                   |
| 6.4.6 Admin-initiated reset without the password (level 3) | Met      | `quro user reset-password`                                                                                                                        |
| 6.5.2 One-way hash only for secrets of 112+ bits           | Met      | Applied to session tokens (256 bits) and operator codes (120 bits), stored as SHA-256 digests; passwords use bcrypt                               |
| 7.1.1 Session lifetime documented                          | Met      | [Sessions](#sessions)                                                                                                                             |
| 7.2.1–7.2.3 Server-side, random 128+ bit tokens            | Met      | 256-bit reference tokens checked against the database                                                                                             |
| 7.2.4 New token at authentication                          | Partial  | Every sign-in issues a new token and there is no pre-authentication session; earlier sessions stay listed in Settings until signed out or expired |
| 7.3.1 Inactivity timeout                                   | Gap      | Accepted for a household app; 30-day absolute lifetime (7.3.2) is met                                                                             |
| 7.4.1, 7.4.2 Terminated sessions stay dead                 | Met      | Sign-out deletes the row; account deletion cascades                                                                                               |
| 7.4.3 End other sessions after a password change           | Met      | Automatic                                                                                                                                         |
| 7.4.5 Administrators can end sessions                      | Met      | `quro user revoke-sessions`                                                                                                                       |
| 7.5.2 View and end active sessions                         | Partial  | Settings → Security, without re-authentication                                                                                                    |
| 13.2.2 Least-privilege database account                    | Met      | The backend uses an app role without DDL; see [Database role separation](#database-role-separation)                                               |
| 13.2.3 No default service credentials                      | Met      | Every password is an operator-provided secret file                                                                                                |
| 13.3.1 Secrets management                                  | Partial  | Docker secret files; no key vault                                                                                                                 |

## Rate Limiting

Auth endpoints are rate-limited with an in-process sliding window counter, keyed as described in
[Proxy trust](#proxy-trust).

| Endpoint                        | Window     | Max requests | Key                |
| ------------------------------- | ---------- | ------------ | ------------------ |
| `POST /api/auth/signin`         | 1 minute   | 5            | Client IP          |
| `POST /api/auth/signin`         | 15 minutes | 5 failed     | Email address      |
| `POST /api/auth/signup`         | 15 minutes | 3            | Client IP          |
| `POST /api/auth/password-reset` | 15 minutes | 5            | Client IP          |
| `PUT /api/settings/password`    | 15 minutes | 5            | Client IP          |
| `POST /api/partner/invite`      | 15 minutes | 10           | Authenticated user |

Requests over the limit receive `429 Too Many Requests`. The limiter state is in memory and resets
when the backend restarts. Rate limiting is disabled when `NODE_ENV=test`.

The per-email sign-in limit counts failed attempts only, whether or not the email has an account.
Each attempt takes a place in the email's budget before the password is checked and gives it back
when the sign-in succeeds, so simultaneous guesses cannot exceed the budget and a success does not
clear earlier failures. While attempts that are still being checked hold the remaining places,
another attempt is refused even if its password is right. The per-address limit counts every
attempt, successful or not.

### Per-email lockout trade-off

The sign-in email limiter stops an attacker who rotates source addresses from guessing one
account's password. Successful sign-ins do not count, so signing in on several devices does not
lock an account. The cost is that anyone can fail five sign-ins for a known email and lock the
owner out for up to 15 minutes. Quro accepts this for a self-hosted, low-user-count deployment. The
lockout expires on its own and does not reveal whether the account exists.

## Nginx Security Headers

The bundled nginx sets these headers on every response:

- **Content-Security-Policy**: scripts, styles, fonts and `connect` from the same origin only.
  Images may also come from `data:` URLs and `https://cdn.jsdelivr.net`. Inline styles are allowed
  (`'unsafe-inline'`) because Tailwind CSS 4 generates runtime styles. `frame-ancestors 'none'`
  prevents embedding.
- **X-Frame-Options: SAMEORIGIN**: legacy framing control, alongside `frame-ancestors`.
- **X-Content-Type-Options: nosniff**: no MIME type sniffing.
- **Referrer-Policy: strict-origin-when-cross-origin**: cross-origin requests get only the origin.
- **X-XSS-Protection: 1; mode=block**: ignored by modern browsers, harmless.
- **Permissions-Policy: camera=(), microphone=(), geolocation=()**: Quro uses none of them.

## Database Role Separation

| Role                 | Environment variable  | Capabilities                                                                    |
| -------------------- | --------------------- | ------------------------------------------------------------------------------- |
| Admin (`quro_admin`) | `POSTGRES_ADMIN_USER` | Full DDL, `TRUNCATE`, migrations, backup/restore                                |
| App (`quro_app`)     | `POSTGRES_APP_USER`   | Table-level `SELECT`, `INSERT`, `UPDATE`, `DELETE`; no schema DDL or `TRUNCATE` |

The `backend` and `pension-import-worker` containers, and the `quro` command, connect as the app
role. The admin role is used only by the `migrate` service (schema migrations and role bootstrap)
and the `db-tools` service (backup, restore, manual SQL). An application bug therefore cannot drop
tables or run migrations. The app role keeps `DELETE` for normal flows such as deleting a pension
pot.

## Network Isolation

- The `frontend` container (nginx) is the only service with a host port (`3000` by default). It
  sits on `frontend-net`.
- The `backend` container sits on `frontend-net` (reachable by nginx) and `backend-net` (reachable
  by the database).
- PostgreSQL (`db`) is on `backend-net` only. Uploaded documents are files in a volume mounted into
  the backend and the import worker, readable by the backend user only (directories `0700`, files
  `0600`). With S3 storage, the store is the operator's and is reached over the network.
- The optional AI services (`vllm`, `pension-parser`) are on `ai-net` with the
  `pension-import-worker`. The main backend cannot reach them.

A compromised frontend container therefore has no direct network path to the database and no
access to the documents volume.
