# HTTPS with a reverse proxy

This page sets up deployment mode B: browsers reach Quro over HTTPS at a reverse proxy you run, which forwards to Quro's bundled nginx. Use it whenever Quro is reachable from outside one trusted home network, and whenever you want encrypted traffic inside it. Quro itself serves plain HTTP and does not enforce TLS; the [security model](security.md#deployment-modes) explains both modes and what each protects.

It starts from an install made with [the install guide](install.md). The tested example runs [Caddy](https://caddyserver.com/) as one more service in `compose.yaml`; [Other proxies](#other-proxies) lists what any proxy must do.

## What you need

- A host name for Quro, for example `quro.example.com`, that resolves to the host from every device that uses Quro. Quro needs its own host name: it cannot run under a path such as `/quro`, and another application on the same host name would receive Quro's session cookie.
- A certificate for that name. Caddy gets one from Let's Encrypt by itself when the name is public and ports 80 and 443 reach the host from the internet. For a name used only on your network, use your own certificate authority, or Caddy's internal one (below).

## Caddy in the Compose project

1. Create `Caddyfile` next to `compose.yaml`:

   ```text
   quro.example.com {
   	reverse_proxy frontend:80
   	header Strict-Transport-Security "max-age=31536000"
   }
   ```

   Caddy redirects HTTP to HTTPS on its own. For a name used only on your network, add a line `tls internal` inside the block: Caddy then issues the certificate from its own authority, and each browser has to trust that authority's root certificate (in the `caddy` volume, at `/data/caddy/pki/authorities/local/root.crt`) once.

2. In `compose.yaml`, add the proxy service under `services`, and its volume under the top-level `volumes`:

   ```yaml
   proxy:
     image: caddy:2.10.2-alpine
     restart: unless-stopped
     ports:
       - '80:80'
       - '443:443'
     volumes:
       - ./Caddyfile:/etc/caddy/Caddyfile:ro
       - caddy:/data
     networks:
       - web
     depends_on:
       - frontend
   ```

   ```yaml
   volumes:
     postgres:
     caddy:
   ```

3. In the same file, delete the `ports` of the `frontend` service. Browsers then reach nginx only through the proxy, never over plain HTTP.

4. In `config/quro.env`, set:

   ```bash
   SECURE_COOKIES=true
   FRONTEND_ORIGIN=https://quro.example.com
   ```

   `SECURE_COOKIES=true` makes browsers send the session cookie only over HTTPS. `FRONTEND_ORIGIN` lets the backend check at startup that the two agree. Keep `TRUSTED_PROXIES=172.16.0.0/12`: Caddy and nginx share the `web` network, which Docker gives an address in that range by default (`docker network inspect quro_web` shows it). If Docker on your host uses other address pools, set `TRUSTED_PROXIES` to that network's subnet.

5. Apply the changes:

   ```bash
   docker compose up -d
   ```

   Compose starts the proxy, recreates `frontend` without its port and recreates `migrate` and `backend` with the new settings.

## Check it

Open `https://quro.example.com` and sign in. Then check, from any machine that resolves the name:

```bash
curl -sI https://quro.example.com/ | grep -i -E '^HTTP|strict-transport|content-security'
curl -sI http://quro.example.com/ | grep -i -E '^HTTP|^location'
```

The first prints `HTTP/2 200`, the HSTS header and the content security policy; the second a redirect to `https://`. The backend logs a `[config]` warning when `SECURE_COOKIES` and the scheme browsers use disagree; this should print nothing:

```bash
docker compose logs backend | grep '\[config\]'
```

In the browser's developer tools, the `session` and `csrf_token` cookies are marked `Secure`.

## A proxy on the host or another machine

When the proxy is not a service in the Compose project, it forwards to nginx's published port instead of `frontend:80`:

- **On the same host:** publish nginx on the loopback interface only, `'127.0.0.1:3000:80'` in the `ports` of `frontend`, and point the proxy at `http://127.0.0.1:3000`. Nginx then sees the proxy's connections coming from an address on the Docker side, usually the gateway of the `web` network. Each line of `docker compose logs frontend` starts with that address; `TRUSTED_PROXIES` must cover it.
- **On another machine:** keep the published port, point the proxy at `http://<host>:3000`, and allow only the proxy to reach that port, for example with a firewall rule on the host. Add the proxy's address to `TRUSTED_PROXIES`, for example `TRUSTED_PROXIES=172.16.0.0/12,192.168.1.10`, so rate limits still apply per browser.

## Other proxies

Traefik, nginx, HAProxy or a hosted tunnel work the same way. The proxy must:

- terminate TLS for Quro's own host name and forward every path, unchanged, to the bundled nginx, never to the backend directly;
- pass the original `Host` header, and set or append `X-Forwarded-For` with the browser's address;
- accept request bodies of at least 25 MB, the upload limit of the bundled nginx;
- redirect HTTP to HTTPS and send `Strict-Transport-Security`, which the bundled nginx cannot do because it only sees HTTP.

`X-Forwarded-Proto` is not used: Quro takes the scheme from `SECURE_COOKIES`, never from a header.

## bunq linking behind the proxy

With [bunq linking](configuration.md#bunq), register `https://quro.example.com/api/bunq/oauth/callback` as the redirect URI with bunq and set the same value as `BUNQ_REDIRECT_URI`. `FRONTEND_ORIGIN` must be `https://quro.example.com`.

## Back to plain HTTP

To return to mode A, remove the `proxy` service and its volume, give `frontend` its `ports` again, set `SECURE_COOKIES=false` and remove `FRONTEND_ORIGIN` (unless bunq needs it), then run `docker compose up -d`. Browsers drop sessions that were created over HTTPS, so everyone signs in again.
