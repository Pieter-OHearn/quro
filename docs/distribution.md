# Distribution

This page states what Quro publishes, how anyone can check that it can be pulled without an account, and what each part of Quro needs in services, hardware and outbound network access. The [install contract](install-contract.md) defines how the images are used; this page covers whether they can be obtained and what running them touches.

## What is published

| Artifact                                        | Where                     | Access                                      |
| ----------------------------------------------- | ------------------------- | ------------------------------------------- |
| `ghcr.io/pieter-ohearn/quro-backend:<version>`  | GitHub Container Registry | Public. Anonymous pull, no registry account |
| `ghcr.io/pieter-ohearn/quro-frontend:<version>` | GitHub Container Registry | Public. Anonymous pull, no registry account |
| `postgres:18` (official image, not Quro's)      | Docker Hub                | Public                                      |
| `ghcr.io/pieter-ohearn/quro-auto-updater`       | GitHub Container Registry | Retired. Old tags stay; no new releases     |

Both Quro images are multi-platform: `linux/amd64` and `linux/arm64`. A release tag (`vX.Y.Z`) and, for a stable release, `latest` point at one image index per package. The pension parser and the model server are not published; the optional statement import builds them from a checkout.

Core artifacts stay public. A release is blocked when the two core images cannot be read anonymously (see [the release check](#the-release-check)). Nothing in the release workflow changes package visibility, and a release requires nothing from the retired auto-updater: its image and the assets of earlier releases stay published as history, and no release builds, tags or attaches them.

## Verify anonymous access

`scripts/lib/image-access.ts` reads the images the way a first-time operator's `docker pull` does and uses no credentials, no Docker daemon and no login. For each image it:

1. Asks `ghcr.io` for a pull token without credentials. A private or missing package is refused here.
2. Reads the tag's image index, checks that it hashes to the digest the registry reports, and finds an entry for every required platform. Attestation entries do not count as a platform.
3. Reads each platform's manifest by digest.
4. Reads every config and layer blob of those manifests: one byte by default, checking that the registry's size matches the manifest, or the whole blob with `--full`, checking its SHA-256 digest and size.

It follows blob redirects itself and sends the pull token only to `ghcr.io`, never to the storage host a blob redirects to. Rate limits and server errors are retried; a missing tag, a refused token or an unreadable layer fails at once and says which.

```bash
bun run check:image-access --tag v0.7.0
bun run check:image-access --tag v0.7.0 --full
bun run check:image-access --tag sha-<commit> --expect quro-backend=sha256:<digest>
```

Exit code 0 means everything was readable, 1 means an image is not readable anonymously, and 2 means the arguments are wrong. Run it against a tag that does not exist to see a failure:

```bash
bun run check:image-access --tag does-not-exist
```

### The release check

- The `CI` workflow runs the check against `latest` on every run, and then runs it against a tag that does not exist and requires that run to fail with "not found". A package that turns private, or a check that stops failing, breaks `CI`.
- The `Release` workflow runs the check, with no login and no token, against the candidate tag `sha-<commit>` and the digests the build produced, after the build and before anything is tagged or published. A new package on GitHub starts private, so the first image of a new name fails here instead of shipping unreadable.

### Check with Docker

The script does not replace a real pull. To pull as a user with nothing configured, point Docker at an empty configuration directory with `--config`. It has the same effect as setting `DOCKER_CONFIG`:

```bash
config_dir="$(mktemp -d)"
docker --config "$config_dir" pull --platform linux/arm64 ghcr.io/pieter-ohearn/quro-backend:v0.7.0
docker --config "$config_dir" pull --platform linux/amd64 ghcr.io/pieter-ohearn/quro-backend:v0.7.0
```

An empty configuration directory also drops the active Docker context. On Docker Desktop, add `--host` with the socket of your context, which `docker context ls` prints.

## Service, feature, hardware and egress matrix

Core Quro is the backend, the frontend and PostgreSQL. It needs no registry account, no GPU, no model, no object store and no bank account. Every other row is optional and off until configured, except where the table says it runs by default.

| Feature or service                                 | Needs                                                                                                            | Hardware                                                                                                                | Outbound network                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core: backend, frontend, PostgreSQL                | The two Quro images and `postgres:18`. No account                                                                | Any `linux/amd64` or `linux/arm64` host. Idle memory 53 MiB, 9 MiB, 183 MiB (measured on arm64 in the install contract) | Image pulls from `ghcr.io` and Docker Hub at install and upgrade. At run time, only the rows below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Document storage on the filesystem (default)       | A directory the backend can write                                                                                | Disk                                                                                                                    | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Prices and exchange rates                          | Nothing to configure. Runs by default in the backend                                                             | None                                                                                                                    | Backend to Yahoo Finance: exchange rates for every supported currency once a day and at start, quotes for the tickers you hold once a day, and a lookup when you add a ticker. The web app shows balances only once a rate for every supported currency is stored, so a new install needs one successful fetch; until then it shows "Converted balances are paused" and the backend retries every minute. After that, without access, rates and prices stop updating and stored rates age; see [financial invariants](financial-invariants.md) for how stale and missing rates are treated |
| Document storage in S3 (`QRO_DOCUMENT_STORAGE=s3`) | Any S3-compatible service you run or rent, a bucket and an access key. Quro pins and ships none                  | Depends on the store                                                                                                    | Backend to `S3_ENDPOINT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| bunq linking                                       | A bunq account and an OAuth client (`BUNQ_CLIENT_ID`, `BUNQ_CLIENT_SECRET`, `BUNQ_REDIRECT_URI`). Off when unset | None                                                                                                                    | Backend to `api.bunq.com` and `api.oauth.bunq.com`, hourly while linked. Your browser to `oauth.bunq.com` when you link. With `BUNQ_SANDBOX`, the `sandbox.bunq.com` hosts instead                                                                                                                                                                                                                                                                                                                                                                                                         |
| Tracing (`OTEL_EXPORTER_OTLP_ENDPOINT`)            | An OTLP/HTTP collector you run. Off when unset                                                                   | None                                                                                                                    | Backend to the endpoint you set                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Emoji picker                                       | Nothing to configure                                                                                             | None                                                                                                                    | Your browser to `cdn.jsdelivr.net` for picker artwork when the picker is open. It is the one third-party host the content security policy allows (`img-src`). Chosen emoji are stored as text                                                                                                                                                                                                                                                                                                                                                                                              |
| Statement import (`pension-import` profile)        | Images built from a checkout (pension parser, vLLM), a Hugging Face token secret for the model                   | NVIDIA GPU (the Compose profile reserves all GPUs), disk for model weights                                              | Image builds pull `python` and `vllm/vllm-openai` base images. The model server downloads the model named in `VLLM_MODEL` from Hugging Face on first start. Backend to parser to model stay on the internal network                                                                                                                                                                                                                                                                                                                                                                        |

Other features make no outbound requests of their own: a search of the backend and frontend source for outbound URLs and clients found none besides the rows above. The scheduled provider jobs for prices and exchange rates are the only calls the backend makes without being asked to link a service. `QRO_DISABLE_SCHEDULERS` stops every interval job for development; it is not a way to turn off one provider.

Checked on 2026-10-10 with the example Compose file and images built from `main`: with the database, the migration job and the backend on Docker networks marked `internal` and the schedulers on, names outside the host did not resolve in the backend container, the backend became ready, and sign-up, sign-in, a ledger write and a document upload and download worked. The only failing jobs were the exchange-rate refresh and the net-worth snapshot, which needs those rates; both retried every minute. A browser signed in to the app loaded nothing from another host while the emoji picker stayed closed.

## Recorded evidence: v0.7.0

Recorded on 2026-10-10 from a host with no Quro or GitHub credentials. Manifest and layer checks used `scripts/lib/image-access.ts`; pulls and runs used a clean container engine (Docker 29.9.0, containerd image store) with an empty `DOCKER_CONFIG` directory and no credential helper.

| Image                                        | Index digest                                                              | Platform      | Image manifest digest                                                     | Blobs | Compressed size |
| -------------------------------------------- | ------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------- | ----- | --------------- |
| `ghcr.io/pieter-ohearn/quro-backend:v0.7.0`  | `sha256:54fe1e7b485c83b8ca448faa843619c3e2e6e566491f0d929a970323bad2923d` | `linux/amd64` | `sha256:e5eb8f44f7cde3ffa299dff05243b3c0bb5c781fa8165ff609be0ac2508eda27` | 20    | 226.2 MB        |
|                                              |                                                                           | `linux/arm64` | `sha256:c9540657c2d87bba13668f25673a89582d34bbc824bf00172b4819aca735b289` | 20    | 224.2 MB        |
| `ghcr.io/pieter-ohearn/quro-frontend:v0.7.0` | `sha256:362710fd5d1e328a69f14446010d3af8cf7c6db22dfa62900114dfafad239d52` | `linux/amd64` | `sha256:c2470c4747307d2aa0fd16900cb0805467c3994f30506ddfe258ab3c127bc290` | 11    | 26.8 MB         |
|                                              |                                                                           | `linux/arm64` | `sha256:28b5f141b8db0e65d0396f03c3d27cf965200157585e2f1f2f1194bc41679483` | 11    | 26.6 MB         |

`latest` pointed at the same two index digests.

| Evidence   | What was done                                                                                                                                                                                                                                | Result                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest   | Anonymous token, image index and all four platform manifests for both images, digests recomputed from the bytes                                                                                                                              | Passed. Each index also lists one attestation manifest per platform                                                                                                                               |
| Layer pull | `--full` run: every config and layer blob of all four platform images downloaded and hashed. Separately, `docker pull --platform` for both platforms of both images in the clean engine                                                      | All blobs matched their digests. All four pulls completed; the engine's per-platform image ids equal the manifest digests above                                                                   |
| Runtime    | In the clean engine: `bun --version` and `pg_dump --version` in the backend, `nginx -v` in the frontend; the frontend serving `/` with HTTP 200; the backend process answering `GET /api/health` with HTTP 200 (schedulers off, no database) | Passed on both platforms. `linux/arm64` ran natively on an arm64 host; `linux/amd64` ran under emulation on the same host, which shows the binaries start, not how they perform on amd64 hardware |

Not covered: native amd64 hardware, a machine without a container engine cache, and the full `quro` command set, which first ships in 0.8.0 (0.7.0 images have no `quro` command, so their runtime check uses the tools and entry points they do have).

## Visibility and private candidate channels

GitHub Container Registry sets visibility per package, not per tag. Every tag of `quro-backend` is public or none is, and likewise for `quro-frontend`. Two consequences:

- The candidate tags `sha-<commit>` that the release workflow pushes before a release live in the same public packages as the version tags. They are readable by anyone from the moment they are pushed.
- A private pre-release channel cannot be a private tag. It needs separate package names, for example `quro-backend-candidate` and `quro-frontend-candidate`, set to private when they are first created, with the release workflow pushing candidates there and promoting by digest to the public names. The core packages must never be made private to hold a candidate.

No workflow in this repository changes package visibility, and none should. Visibility is a setting an owner changes on GitHub, so a change to a core package is a deliberate act that the anonymous check then reports.
