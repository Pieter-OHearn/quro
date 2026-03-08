# Quro

Quro is a full-stack personal finance app for people who want a clear, modern view of their money without managing a maze of spreadsheets.

## Quick links

- [What is Quro?](#what-is-quro)
- [Product features](#product-features)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Local development](#local-development)
- [Testing and quality checks](#testing-and-quality-checks)
- [Docker usage](#docker-usage)
- [How to fork this repo](#how-to-fork-this-repo)
- [License](#license)

## What is Quro?

Quro gives you one beautifully organised place to track your financial life.  
It combines savings, investments, mortgage, pension, salary, goals, and budgeting into a single experience built around clarity and momentum.

At a glance, Quro helps you:

- understand your current net worth
- track progress across every major money category
- work across multiple currencies

## Product features

- Dashboard with net worth snapshots, allocations, and activity
- Savings account and transaction tracking
- Investment holdings and buy/sell/dividend tracking
- Pension pot tracking and contribution history
- Mortgage tracking (repayments, balances, property links)
- Salary and payslip history
- Goals with targets, deadlines, and progress
- Budget categories and spend tracking
- Currency conversion support

## Tech stack

- Monorepo with Bun workspaces
- Frontend: React + Vite + React Router + Tailwind CSS
- Backend: Bun + Hono + Drizzle ORM
- Database: PostgreSQL
- Containerization: Docker + Docker Compose

## Repository structure

```text
.
├── packages/
│   ├── frontend/   # React/Vite app (+ .env/.env.example)
│   ├── backend/    # Hono API + Drizzle/Postgres (+ .env/.env.example)
│   └── shared/     # Shared types/utilities
├── docker-compose.yml
└── README.md
```

## Prerequisites

- Bun 1.x
- Python 3.11+
- Docker (for infrastructure and full-stack container runs)

## Local development (Bun + Python parser)

1. Install dependencies:

```bash
bun install
```

2. Create your local env files:

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

Backend env includes MinIO-backed document storage settings used for pension annual-statement PDFs.
It also includes the parser worker settings for AI-based pension statement import drafts.

3. Start required infra with Docker (DB and object storage):

```bash
docker compose --env-file packages/backend/.env up -d db minio minio-init
```

4. Run database migrations:

```bash
bun run db:migrate
```

5. (Optional but recommended) Seed demo data:

```bash
bun run db:seed
```

6. Start frontend + backend in dev mode:

```bash
bun run dev
```

7. Start the pension import worker in a second terminal:

```bash
set -a
source packages/backend/.env
set +a
bun run --filter '@quro/backend' worker:pension-imports
```

8. Start the Python pension parser service in a third terminal:

```bash
set -a
source packages/backend/.env
set +a
python3 -m venv .venv
source .venv/bin/activate
pip install -r services/pension-parser/requirements.txt
uvicorn app.main:app --app-dir services/pension-parser --host 0.0.0.0 --port 8080
```

Pension statement extraction now uses `vllm` only.
If your MacBook is too weak for this workload, point `VLLM_BASE_URL` at a reachable GPU host before starting the worker and parser.
If you skip the worker or parser locally, the app will keep pension PDF import disabled and show `AI off`.

Recommended parser settings:

```bash
PENSION_PARSER_TIMEOUT_MS=300000
PARSER_ALLOW_REGEX_FALLBACK=true
PARSER_REGEX_ONLY=false
VLLM_TIMEOUT_SECONDS=180
```

If `vllm` is temporarily unavailable, set `PARSER_REGEX_ONLY=true` for local flow validation.

For OCR fallback locally, install system packages used by the parser (`poppler` + `tesseract`, including Dutch language data).

9. Open the app:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/health`
- Parser health: `http://localhost:8080/health`

### Useful dev commands

```bash
# Start only frontend
bun run dev:frontend

# Start only backend
bun run dev:backend

# Clear all seeded/working data
bun run db:clear
```

### Seeded demo account

If you run `bun run db:seed`, a demo user is created:

- Email: `demo@quro.local`
- Password: `password123`

## Testing and quality checks

There is currently no automated unit/integration test script wired in `package.json`.

Use the current quality checks:

```bash
# Lint
bun run lint

# Auto-fix lint issues
bun run lint:fix

# Prettier check
bun run format:check

# Prettier write
bun run format
```

## Docker usage

### Run core stack with Docker Compose

This mode runs the app shell in Docker: frontend, backend, database, and MinIO.
Pension statement import is auto-disabled in this mode because the AI worker stack is not running.
The pension UI shows an `AI off` badge until the pension-import profile is started.

```bash
docker compose --env-file packages/backend/.env up --build
```

Services:

- Frontend (nginx): `http://localhost`
- Backend API: `http://localhost:3000`
- Postgres: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

### Pension import stack (vLLM only)

This profile adds the pension import worker, parser, and `vllm` to the Docker stack.
Run it on a GPU-capable host.

Start compose with the `pension-import` profile:

```bash
docker compose --profile pension-import --env-file packages/backend/.env up --build
```

Additional services:

- vLLM API: `http://localhost:8000`
- Pension parser API: `http://localhost:8080`
- Pension import worker: `pension-import-worker` (background service, no public port)

The compose file uses container-internal service URLs automatically for MinIO, the parser, and `vllm`, so the host-facing values in `packages/backend/.env` can stay pointed at `127.0.0.1` for local non-Docker development.

Stop services:

```bash
docker compose --env-file packages/backend/.env down
```

Remove containers + volume (clears DB data):

```bash
docker compose --env-file packages/backend/.env down -v
```

### Build images directly

```bash
docker build -t quro-backend -f packages/backend/Dockerfile .
docker build -t quro-frontend -f packages/frontend/Dockerfile .
```

Use local development mode for faster UI/API iteration, and Docker full stack mode for regular end-to-end usage.

## How to fork this repo

1. Fork the repository on GitHub.
2. Clone your fork:

```bash
git clone <your-fork-url>
cd quro
```

3. Add the original repo as upstream:

```bash
git remote add upstream <original-repo-url>
```

4. Create a working branch:

```bash
git checkout -b feature/my-change
```

5. Commit and push:

```bash
git add .
git commit -m "Describe your change"
git push origin feature/my-change
```

6. Open a pull request from your fork.

## License

This project is licensed under the MIT License.
