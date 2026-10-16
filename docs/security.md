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
  instead (`docker network inspect` shows it).
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
- Sessions are deleted with their account ([export and deletion](data-export-and-deletion.md)).

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
| Secrets key                               | The file `QRO_SECRETS_KEY_FILE` names           | No                  | Reconnect bunq in Settings; all other data stays intact              |
| bunq access tokens and keys               | Database (`bunq_connections`), encrypted        | Encrypted only      | Reconnect bunq in Settings                                           |
| User passwords                            | Database, as bcrypt hashes                      | Yes, as hashes      | `quro user reset-password`                                           |
| Session tokens                            | Browser cookie; database holds the digest       | Digest only         | Sign in again                                                        |
| Registration and reset codes              | Shown once; database holds the digest           | Digest only         | Issue a new code                                                     |

Rules that follow from this table:

- A database dump or backup archive contains financial records, password hashes and the
  encrypted bank-link secrets. Store it as carefully as the live instance, and encrypt archives
  that leave the machine. See [backup and restore](backup-and-restore.md).
- The secret files, including the secrets key, are not in a dump. Back them up separately,
  somewhere only the operator can read, and not next to the dumps: whoever holds an archive and
  the secrets key can use the bank links in it.
- Restoring a dump restores the sessions that existed when it was taken. Run
  `quro user revoke-sessions` for affected accounts if that matters.

## Integration secrets

Integration secrets are the credentials Quro keeps to talk to a bank on a user's behalf: for each
connected bunq account, the OAuth access token, the private key of the device Quro registers with
bunq, the installation token and the current session token (`access_token`, `private_key`,
`installation_token` and `session_token` of `bunq_connections`). The server's public key and the
bunq user id in the same row are not secret. The bunq OAuth client id and secret are settings, not
database rows; see [the configuration reference](configuration.md#bunq).

Each of these values is stored encrypted with one key that the operator holds outside the
database. The server opens a value only in memory, when it calls bunq, and seals every new or
renewed value before it writes it. No API response, log line, trace or `quro` command shows a
stored value; `quro secrets status` and `quro doctor` print counts and key ids only.

### The secrets key

- One key per instance, in the file `QRO_SECRETS_KEY_FILE` names (default
  `/run/secrets/secrets_key`): 32 random bytes written as 64 hexadecimal characters. `quro init`
  writes it with the database passwords (mode `0600`, never printed); `openssl rand -hex 32` makes
  one by hand.
- The backend checks the file when a container starts. A file that exists but holds anything else
  stops every container with exit code 2 and a message that names the setting, never the content.
  Once bunq linking is configured the key is required: without it the backend does not start.
- The key never enters the database, a backup archive, a log or the settings file. Each key has a
  key id, 16 hexadecimal characters derived from it, which `quro secrets status`, `quro doctor`,
  `quro backup` and `quro restore` print so the operator can match a key file to the data that
  needs it. A key id reveals nothing about the key.
- Where it sits in the key hierarchy: the database passwords and the secrets key are both operator
  secret files, independent of each other. The backup encryption key protects archives, which
  contain the encrypted bank-link secrets but never the secrets key. Holding a database dump alone
  gives no usable bank credential.

### Envelope format

Each value is one line of text in its own column:

```text
quro-secret:v1:aes-256-gcm:<key id>:<nonce>:<ciphertext>:<tag>
```

| Part                   | Meaning                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `quro-secret`, `v1`    | Marker and envelope version. A value with another version or algorithm is refused, never guessed at        |
| `aes-256-gcm`          | AES-256 in GCM mode, through Node's crypto module                                                          |
| key id                 | HKDF-SHA256 of the key under its own label, first 8 bytes in hexadecimal: which key sealed the value       |
| nonce, ciphertext, tag | A random 12-byte nonce per value, the ciphertext and the 16-byte authentication tag, base64url, no padding |

The AES key is derived from the operator's key with HKDF-SHA256 under a different label from the
key id. The associated data is the envelope header up to the key id plus the value's place: table,
column and the id of the user who owns the row (unique in `bunq_connections`). A value copied into
another column or another user's row fails its tag check, exactly like a changed byte or a wrong
key, and is reported as unreadable rather than used. The code is
`packages/backend/src/lib/secretEnvelope.ts`; the list of secret columns is
`packages/backend/src/lib/integrationSecrets.ts`.

### Encrypting stored secrets

`quro secrets encrypt` encrypts every stored value that is not yet encrypted. Releases up to 0.8.0
stored them unencrypted; the [0.9.0 upgrade notes](upgrade.md#secrets-key-for-bank-links) say when
to run it.

- It works one bank connection at a time: a transaction locks the row, reads it again, and writes
  every converted column in one `UPDATE`. A row is never left with some columns converted by a run
  and others not; an interrupted run (a killed container, a lost connection) leaves each row as it
  was or fully converted, and running the command again converts the rest. Values that are already
  encrypted are skipped, so a second run changes nothing.
- It holds the maintenance lock in shared mode, like any write: it waits for nothing and refuses
  while `quro backup` or `quro restore` runs. Row locks keep it safe next to a running 0.9.0
  server, which also writes only encrypted values. Stop older servers first: they would use the
  encrypted text as a token.
- Nulls stay null, and values it cannot open (sealed with an unknown key, or damaged) are left as
  they are and reported.
- The server does the same for a connection it is about to use that still holds unencrypted values
  (for example after restoring an older backup), so a configured server never keeps using
  plaintext. `quro doctor` warns while any value is unencrypted.

`quro secrets status` (read-only) reports how many values are encrypted with the current key, with
the previous key, with a key that is not configured, unencrypted or damaged, opening each encrypted
value in memory to check its tag. It exits 0 when every stored value is on the current key (or none
is stored) and 1 otherwise, with the command to run. `--json` gives the same report for scripts.

### Rotate the secrets key

Rotation is an offline procedure with the `migrate` service (or any `quro` container with both key
files):

1. Take a backup with `quro backup`, and keep a copy of the current key file.
2. Create the new key next to the old one, for example
   `openssl rand -hex 32 > config/secrets/secrets_key.new`, and keep a copy apart from your backups.
3. Stop the backend (`docker compose stop backend`).
4. Point `QRO_SECRETS_KEY_FILE` at the new key and `QRO_SECRETS_PREVIOUS_KEY_FILE` at the old one
   (mount both files), then run `quro secrets rotate`. It re-encrypts, one connection per
   transaction, every value the previous key opens (and any unencrypted value) with the new key.
   An interrupted run leaves some rows on each key; both stay readable, and running it again
   finishes the rest.
5. `quro secrets status` with the new key alone must exit 0. Then remove
   `QRO_SECRETS_PREVIOUS_KEY_FILE`, start the backend and run a bunq sync.

Keep the old key for as long as you keep backups taken before the rotation: they need it.

### If the secrets key is lost

Nothing but the bank links is lost. Generate a new key (`quro init` writes one if the file is
missing), start Quro, and have each user with a connected bunq account connect it again in
**Settings**. Until then a sync answers that the stored credentials cannot be read and asks for a
reconnect, without calling bunq; `quro secrets status` lists the affected user ids. Connecting
again replaces every stored credential of that connection. Accounts and transactions imported
earlier stay.

### Backups and the secrets key

An archive holds the encrypted values only. Its manifest records the key id of every key that
sealed them, and `quro backup` prints it. To restore an archive with its bank links intact, the
instance needs the key with that id: keep each key file for as long as you keep an archive that
needs it, apart from the archives. A restore without it succeeds and keeps every other row; the
users then reconnect bunq.

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
(147 in 27 files) and fails when a new one appears or when one touches a shareable table without
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
| 13.3.1 Secrets management                                  | Partial  | Docker secret files; no key vault. Stored bank-link secrets are encrypted with an operator-held key ([integration secrets](#integration-secrets)) |
| 13.4.1 No source control metadata deployed                 | Met      | `.dockerignore` keeps `.git` out of the images                                                                                                    |
| 15.1.1 Documented remediation time frames                  | Met      | [SECURITY.md](../SECURITY.md#how-findings-are-handled)                                                                                            |
| 15.2.1 Components within their remediation time frames     | Partial  | Critical findings fail CI; high findings are listed for triage. Debian packages without a fixed version stay until Debian ships one               |

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
| `DELETE /api/settings/account`  | 15 minutes | 5            | Client IP          |
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

## Container hardening

The backend and frontend images and [the example Compose file](compose.example.yaml) limit what a
compromised process inside a container can do. The clean-install and recovery-drill tests run
startup, migrations, sign-in, document uploads, backups and restores under these settings.

| Setting             | Backend (`migrate`, `backend`)                                     | Frontend (nginx)                                           | `db` (PostgreSQL image)                                                    |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| User                | UID 1000 (image default); any `--user` works                       | UID 101, the image's `nginx` user; any `--user` works      | Starts as root, then runs PostgreSQL as `postgres`                         |
| Root filesystem     | Read-only                                                          | Read-only                                                  | Writable                                                                   |
| Write paths         | `/tmp` (tmpfs), `/var/lib/quro/documents`, `/var/lib/quro/backups` | `/tmp` (tmpfs): pid file, temporary files, rendered config | `/var/lib/postgresql` (volume)                                             |
| Linux capabilities  | None                                                               | None                                                       | `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`, for the entry point |
| `no-new-privileges` | Yes                                                                | Yes                                                        | Yes                                                                        |
| Memory, processes   | 1 GiB, 200                                                         | 256 MiB, 200                                               | 1 GiB, 200                                                                 |
| Health check        | `quro health` (image and Compose); off for `migrate`               | `GET /healthz` from the image                              | `pg_isready` (Compose)                                                     |

The backend image holds the backend's production dependencies and source only: no frontend,
build, lint or test tooling and no test files. Both images apply the base distribution's security
updates when they are built.

nginx listens on port 80 inside the container without a capability: the example sets
`net.ipv4.ip_unprivileged_port_start=0` for the frontend, which is Docker's default for a container
with its own network namespace. With host networking, or a runtime that does not allow it, publish
the frontend through a container network instead.

The limits are sized for a household instance with headroom; raise `mem_limit` if a backup or
restore of a large database is stopped by the kernel (exit code 137). A read-only root filesystem
needs `/tmp` as tmpfs in both images; without one, the frontend stops at startup with a message
saying so. nginx buffers large uploads and responses in `/tmp`, so they count toward the frontend's
memory limit: 256 MiB leaves room for several 25 MB uploads at once.

What the hardening does not cover: the containers share the host's kernel, so a kernel flaw is
outside these controls; the `db` entry point keeps the capabilities above; the images are not
signed and ship no SBOM, so verify them by digest ([install](install.md#verify-the-images)); and
the base distributions carry vulnerabilities without a fixed package, which the scans list until a
fix exists ([SECURITY.md](../SECURITY.md#how-findings-are-handled)).

## Licences

Quro is MIT-licensed. CI lists the licence of every third-party package Quro ships, the production
dependencies of the backend, frontend and shared workspaces and the Python packages of the optional
statement-import parser, and fails when one has no licence or a licence outside this list:
0BSD, Apache-2.0, BlueOak-1.0.0, BSD-2-Clause, BSD-3-Clause, CC-BY-4.0, CC0-1.0, HPND, ISC, MIT,
MIT-CMU, MPL-2.0, OFL-1.1, PSF-2.0, Python-2.0 and Unlicense. An `OR` expression needs one listed
licence, an `AND` expression all of them. Development tooling is not shipped and is not listed.
Packages from the base images' distributions keep their distribution's licences.

Run `bun scripts/lib/licence-inventory.ts` after `bun install` for the inventory as Markdown; add
`--python <interpreter>` for the parser's packages (see
[development](development.md#security-scans)).

## Network Isolation

- The `frontend` container (nginx) is the only service with a host port (`3000` by default). It
  sits on `frontend-net`.
- The `backend` container sits on `frontend-net` (reachable by nginx) and `backend-net` (reachable
  by the database).
- PostgreSQL (`db`) is on `backend-net` only. Uploaded documents are files in a volume mounted into
  the backend and the import worker, readable by the backend user only (directories `0700`, files
  `0600`). With S3 storage, the store is the operator's and is reached over the network.
- The optional, experimental OCR services (`vllm`, `pension-parser`, Compose profile `ocr`) are on
  the internal `ocr-net` with the `pension-import-worker`. The main backend cannot reach them, and
  the parser has no route out of the host. Only the model server has a second network, to download
  its model; `VLLM_HF_HUB_OFFLINE=1` stops downloads once the model is cached. Both run as non-root
  users with all capabilities dropped and CPU, memory and process limits. The parser reads each
  document in a child process with its own limits (see
  [bounds on document processing](development.md#bounds-on-document-processing)).

A compromised frontend container therefore has no direct network path to the database and no
access to the documents volume.
