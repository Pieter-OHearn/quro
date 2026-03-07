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
It also includes parser worker settings for AI-based pension statement import drafts.

3. Start required infra with Docker (DB, object storage, and local LLM):

```bash
docker compose --env-file packages/backend/.env up -d db minio minio-init ollama ollama-init
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

This dev mode uses `PARSER_LLM_BACKEND=ollama` by default (Mac-friendly).

Recommended local parser tuning for Mac:

```bash
PENSION_PARSER_TIMEOUT_MS=300000
PARSER_ALLOW_REGEX_FALLBACK=true
PARSER_REGEX_ONLY=false
OLLAMA_TIMEOUT_SECONDS=300
OLLAMA_NUM_CTX=8192
OLLAMA_MAX_TEXT_CHARS=12000
```

If Ollama is too slow on your Mac for extraction, temporarily set `PARSER_REGEX_ONLY=true` for local flow validation.

For OCR fallback locally, install system packages used by the parser (`poppler` + `tesseract`, including Dutch language data).

9. Open the app:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/health`
- Parser health: `http://localhost:8080/health`
- Ollama API: `http://localhost:11434`

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

### Run full stack with Docker Compose (regular usage)

This mode runs everything in Docker: frontend, backend, database, MinIO, parser, worker, and local LLM.

```bash
docker compose --env-file packages/backend/.env up --build
```

By default this uses Ollama (`PARSER_LLM_BACKEND=ollama`).

Services:

- Frontend (nginx): `http://localhost`
- Backend API: `http://localhost:3000`
- Postgres: `localhost:5432`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Ollama API: `http://localhost:11434`
- Pension parser API: `http://localhost:8080`
- Pension import worker: `pension-import-worker` (background service, no public port)

### GPU profile (for your RTX PC later)

To run parser extraction against vLLM instead of Ollama:

1. In `packages/backend/.env`, set:

```bash
PARSER_LLM_BACKEND=vllm
```

2. Start compose with the GPU profile:

```bash
docker compose --profile gpu --env-file packages/backend/.env up --build
```

This starts `vllm` on `http://localhost:8000` in addition to the default stack.

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
