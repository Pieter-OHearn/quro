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
│   ├── frontend/   # React/Vite app
│   ├── backend/    # Hono API + Drizzle/Postgres
│   └── shared/     # Shared types/utilities
├── docker-compose.yml
└── .env.example
```

## Prerequisites

- Bun 1.x
- Docker (for PostgreSQL and full-stack container runs)

## Local development

1. Install dependencies:

```bash
bun install
```

2. Create your local env file:

```bash
cp .env.example .env
```

3. Start PostgreSQL:

```bash
docker compose up -d db
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

7. Open the app:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/health`

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

### Run full stack with Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend (nginx): `http://localhost`
- Backend API: `http://localhost:3000`
- Postgres: `localhost:5432`

Stop services:

```bash
docker compose down
```

Remove containers + volume (clears DB data):

```bash
docker compose down -v
```

### Build images directly

```bash
docker build -t quro-backend -f packages/backend/Dockerfile .
docker build -t quro-frontend -f packages/frontend/Dockerfile .
```

For normal development and full local runs, `docker compose` is the recommended path.

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
