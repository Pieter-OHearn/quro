# Adding a New Feature Module — End-to-End Guide

This guide walks through adding a new feature from scratch, following the exact patterns used in the existing codebase. The example used throughout is **recurring payments** — a feature that lets users track fixed recurring expenses (subscriptions, standing orders, etc.).

The recurring-payments files below are illustrative, not existing source paths.
<!-- docs:check skip-paths: packages/backend/src/routes/recurring-payments, packages/frontend/src/features/recurring-payments/ -->

Follow the existing feature nearest your change and the invariants in
[AGENTS.md](../AGENTS.md); adapt the example to the actual domain dependencies.

## Reference implementation

Goals is the current reference for a user-owned resource:

- **Contract:** `packages/shared/src/types/index.ts` or `types/payloads.ts`,
  re-exported from `packages/shared/src/index.ts`.
- **Validation and owned CRUD:** `packages/backend/src/routes/goals.ts`,
  `packages/backend/src/lib/requestValidation.ts` and `packages/backend/src/lib/access.ts`.
  Goals validates referenced records and validates PATCH requests against the merged
  row (`mergeGoalPayload`), not just the incoming fields.
- **Joint resources:** use `packages/backend/src/lib/partner.ts` and the relevant
  parent/transaction route instead of the user-only pattern.
- **Frontend:** `packages/frontend/src/features/goals/hooks/useGoals.ts` and
  `hooks/mutations.ts`, with keys in `src/lib/queryKeys.ts` and cache dependencies in
  `src/lib/queryInvalidation.ts`.

Choose tests by the behavior you change:

| Change                                    | Tests                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Validation, money, dates, FX, attribution | Co-located Bun tests and shared utilities                                                                                           |
| Auth, ownership, referenced parents, CRUD | Route integration tests with `packages/backend/src/test/integration.ts`, a distinct synthetic email domain and an isolated database |
| Cache updates                             | `packages/frontend/src/lib/queryInvalidation.test.ts`; check affected and unrelated queries                                         |

Focused examples from the repository root:

```bash
NODE_ENV=test bun test packages/backend/src/lib/requestValidation.test.ts packages/backend/src/routes/goals.test.ts
bun run --filter '@quro/frontend' test src/lib/queryInvalidation.test.ts
```

For schema changes, also follow the migration steps in section 2 and
[development](development.md#testing-and-quality-checks).

---

## 1. Shared types

**File:** `packages/shared/src/types/index.ts`

Add the data shape and any input types that both the frontend and backend will reference. Follow the pattern used for `Debt`, `Goal`, and so on.

```ts
export type RecurringPayment = {
  id: number;
  name: string;
  amount: number;
  currency: CurrencyCode;
  frequency: 'monthly' | 'annual';
  nextDueDate: string;
  category: string;
  color: string;
  emoji: string;
  notes: string | null;
};
```

If the allowed values for a field form a closed set (like `frequency` above), define them as a `const` tuple so you can derive the type from it and reuse the value in validation:

```ts
export const RECURRING_PAYMENT_FREQUENCIES = ['monthly', 'annual'] as const;
export type RecurringPaymentFrequency = (typeof RECURRING_PAYMENT_FREQUENCIES)[number];
```

Export types through `packages/shared/src/index.ts`, which re-exports
`src/types/index.ts`, `src/types/payloads.ts` and `src/utils/index.ts`. Put input
contracts in `types/payloads.ts` when appropriate; do not create a second copy in
the frontend.

---

## 2. Database schema

**File:** `packages/backend/src/db/schema.ts`

Add a new `pgTable` definition. The pattern across all existing tables is consistent:

- `id: serial('id').primaryKey()`
- `userId: integer('user_id').references(() => users.id).notNull()`
- Monetary amounts use the schema-local `numericAsNumber('col', { precision: 19, scale: 2 })`;
  the driver mapping parses finite numbers and preserves nulls. Public API values are numbers
- Dates use `date('col', { mode: 'string' })` — returns an ISO `YYYY-MM-DD` string
- Always add a `userIdx` on `userId` so queries scoped to the authenticated user hit an index

```ts
export const recurringPayments = pgTable(
  'recurring_payments',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: text('name').notNull(),
    amount: numericAsNumber('amount', { precision: 19, scale: 2 }).notNull(),
    currency: currencyCodeEnum('currency').notNull(),
    frequency: text('frequency').notNull(),
    nextDueDate: date('next_due_date', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
    color: text('color').notNull(),
    emoji: text('emoji').notNull(),
    notes: text('notes'),
  },
  (table) => ({
    userIdx: index('recurring_payments_user_id_idx').on(table.userId),
  }),
);
```

Use `currencyCodeEnum` (already defined in the schema file) for currency columns rather than plain `text`.

After editing the schema, generate and review the SQL, journal and snapshots.
Apply only to an isolated synthetic database selected as described in
[Testing and Quality Checks](development.md#testing-and-quality-checks):

```bash
# from packages/backend
bun run db:generate   # generates a new migration file under src/db/migrations/
bun run db:migrate    # applies it to the explicitly selected isolated database
```

---

## 3. Backend route

**File:** `packages/backend/src/routes/recurring-payments.ts`

Create a new file. The existing route files fall into two styles; **prefer the newer `requestValidation` style** used in `goals.ts` over the manual parsing style used in `debts.ts`. The `requestValidation` helpers (`parseTextField`, `parseNumberField`, `parseDateField`, `parseCurrencyField`, `rejectUnknownFields`, `parseRequiredFields`, `parsePatchFields`, `readJsonBody`, `parseId`, `ok`, `err`) are all exported from `src/lib/requestValidation.ts` and handle the common cases cleanly.

```ts
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { RECURRING_PAYMENT_FREQUENCIES, type RecurringPaymentFrequency } from '@quro/shared';
import { HTTP_STATUS } from '../constants/http';
import { db } from '../db/client';
import { recurringPayments } from '../db/schema';
import { getAuthUser } from '../lib/authUser';
import {
  err,
  ok,
  parseCurrencyField,
  parseDateField,
  parseId,
  parseNumberField,
  parseOptionalTextField,
  parsePatchFields,
  parseRequiredFields,
  parseTextField,
  readJsonBody,
  rejectUnknownFields,
  type FieldParsers,
  type ParseResult,
} from '../lib/requestValidation';

const app = new Hono();

const FIELDS = [
  'name',
  'amount',
  'currency',
  'frequency',
  'nextDueDate',
  'category',
  'color',
  'emoji',
  'notes',
] as const;

type Payload = {
  name: string;
  amount: number;
  currency: 'EUR' | 'GBP' | 'USD' | 'AUD' | 'NZD' | 'CAD' | 'CHF' | 'SGD';
  frequency: RecurringPaymentFrequency;
  nextDueDate: string;
  category: string;
  color: string;
  emoji: string;
  notes: string | null;
};

function parseFrequency(value: unknown): ParseResult<RecurringPaymentFrequency> {
  return typeof value === 'string' &&
    RECURRING_PAYMENT_FREQUENCIES.includes(value as RecurringPaymentFrequency)
    ? ok(value as RecurringPaymentFrequency)
    : err('Invalid frequency');
}

const parsers: FieldParsers<Payload> = {
  name: (v) => parseTextField(v, 'Name is required'),
  amount: (v) => parseNumberField(v, 'Amount must be greater than zero', 0.01),
  currency: parseCurrencyField,
  frequency: parseFrequency,
  nextDueDate: (v) => parseDateField(v, 'Next due date must be a valid ISO date'),
  category: (v) => parseTextField(v, 'Category is required'),
  color: (v) => parseTextField(v, 'Color is required'),
  emoji: (v) => parseTextField(v, 'Emoji is required'),
  notes: (v) => parseOptionalTextField(v, 'Notes must be a string'),
};

function parseCreate(body: unknown): ParseResult<Payload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parseRequiredFields(body as Record<string, unknown>, parsers);
}

function parsePatch(body: unknown): ParseResult<Partial<Payload>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return err('Invalid payload');
  }
  const strictCheck = rejectUnknownFields(body as Record<string, unknown>, FIELDS);
  if (!strictCheck.ok) return strictCheck;
  return parsePatchFields(body as Record<string, unknown>, parsers);
}

app.get('/', async (c) => {
  const user = getAuthUser(c);
  const data = await db
    .select()
    .from(recurringPayments)
    .where(eq(recurringPayments.userId, user.id));
  return c.json({ data });
});

app.get('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .select()
    .from(recurringPayments)
    .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, user.id)));
  if (!data) return c.json({ error: 'Not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.post('/', async (c) => {
  const user = getAuthUser(c);
  const rawBody = await readJsonBody(c.req, 'Invalid payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parseCreate(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .insert(recurringPayments)
    .values({ ...body.value, userId: user.id })
    .returning();
  return c.json({ data }, HTTP_STATUS.CREATED);
});

app.patch('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid id' }, HTTP_STATUS.BAD_REQUEST);

  const rawBody = await readJsonBody(c.req, 'Invalid payload');
  if (!rawBody.ok) return c.json({ error: rawBody.error }, HTTP_STATUS.BAD_REQUEST);

  const body = parsePatch(rawBody.value);
  if (!body.ok) return c.json({ error: body.error }, HTTP_STATUS.BAD_REQUEST);
  if (Object.keys(body.value).length === 0) {
    return c.json({ error: 'No fields provided' }, HTTP_STATUS.BAD_REQUEST);
  }

  const [data] = await db
    .update(recurringPayments)
    .set(body.value)
    .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

app.delete('/:id', async (c) => {
  const user = getAuthUser(c);
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'Invalid id' }, HTTP_STATUS.BAD_REQUEST);

  const [data] = await db
    .delete(recurringPayments)
    .where(and(eq(recurringPayments.id, id), eq(recurringPayments.userId, user.id)))
    .returning();
  if (!data) return c.json({ error: 'Not found' }, HTTP_STATUS.NOT_FOUND);
  return c.json({ data });
});

export default app;
```

Key points:

- Always call `getAuthUser(c)` at the start of every handler to retrieve the authenticated user. This is set by the `requireAuth` middleware (applied in `src/index.ts` before the route is mounted) — you do not call `requireAuth` inside the route file itself.
- All queries must include `eq(<table>.userId, user.id)`. This is the sole ownership check: a 404 response when the row exists but belongs to another user leaks no information about whether it exists.
- Return `{ data: ... }` on success, `{ error: "..." }` on failure.
- Reject client-supplied ownership fields. `rejectUnknownFields` rejects every key
  outside the declared allowlist, including `userId`; derive it from auth context.
- For joint resources, use the owned/joint predicates and parent attribution in
  `src/lib/partner.ts` instead of copying the user-only example.
- Schema `numericAsNumber` columns accept numbers and serialize them for PostgreSQL.
  Do not stringify public amounts; keep nullable values nullable.

---

## 4. Mount the route

**File:** `packages/backend/src/index.ts`

Mount the Hono app. The global `/api/*` authentication guard already protects new features. Public exceptions must be added explicitly to the shared exact-path list in `src/lib/publicPaths.ts`.

```ts
import recurringPayments from './routes/recurring-payments';

// in the route mounting section:
app.route('/api/recurring-payments', recurringPayments);
```

Follow the same ordering convention as the existing entries — middleware registrations first, then route mounts.

---

## 5. Frontend hooks

**Directory:** `packages/frontend/src/features/recurring-payments/hooks/`

Use typed `apiGet`, `apiPost`, `apiPatch`, `apiDelete` helpers from `src/lib/api.ts` and
central keys from `src/lib/queryKeys.ts`. Add a new key for this resource and
register its mutation domain in `src/lib/queryInvalidation.ts` based on actual
server readers. Current examples are `features/goals/hooks/useGoals.ts` and
`features/goals/hooks/mutations.ts`.

```ts
// Assuming queryKeys.recurringPayments and a recurringPayment domain were added:
import { useQuery } from '@tanstack/react-query';
import type { RecurringPayment } from '@quro/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useDomainMutation } from '@/lib/useDomainMutation';

export function useRecurringPayments() {
  return useQuery({
    queryKey: queryKeys.recurringPayments,
    queryFn: () => apiGet<RecurringPayment[]>('/api/recurring-payments'),
  });
}

export function useCreateRecurringPayment() {
  return useDomainMutation('recurringPayment', (payload: Omit<RecurringPayment, 'id'>) =>
    apiPost<RecurringPayment>('/api/recurring-payments', payload),
  );
}

export function useDeleteRecurringPayment() {
  return useDomainMutation('recurringPayment', (id: number) =>
    apiDelete<RecurringPayment>(`/api/recurring-payments/${id}`),
  );
}
```

Do not maintain invalidation lists in individual hooks. `useDomainMutation` awaits
the dependencies declared for that domain in `src/lib/queryInvalidation.ts`. If
recurring payments become inputs to dashboard or runway, include those readers in
the domain map and test them. Do not assume every mutation changes financial totals.

Export the feature hooks from a local `hooks/index.ts` barrel. The Axios client
uses `VITE_API_URL` and credentials; pass API paths rather than hardcoded origins.

---

## 6. Frontend page component

**File:** `packages/frontend/src/features/recurring-payments/RecurringPaymentsPage.tsx`

Create the page component. Import the hooks from the local `hooks/` barrel. Current pages compose feature components and hooks; see `features/goals/GoalsPage.tsx`.
Keep forms, modals and computations in their existing feature modules rather than
growing a single page file.

```tsx
import { useRecurringPayments, useDeleteRecurringPayment } from './hooks';
import { LoadingState, EmptyState, ContentSection } from '@/components/ui';
import { Calendar } from 'lucide-react';

export function RecurringPaymentsPage() {
  const { data: payments, isLoading } = useRecurringPayments();
  const deletePayment = useDeleteRecurringPayment();

  if (isLoading) return <LoadingState />;
  if (!payments?.length) {
    return (
      <EmptyState
        icon={Calendar}
        title="No recurring payments"
        description="Add a payment to start tracking recurring expenses."
      />
    );
  }

  return (
    <ContentSection spacing="md">
      <h2>Recurring Payments</h2>
      {payments.map((payment) => (
        <div key={payment.id}>
          {payment.emoji} {payment.name} — {payment.amount} {payment.currency}
          <button onClick={() => deletePayment.mutate(payment.id)}>Delete</button>
        </div>
      ))}
    </ContentSection>
  );
}
```

**`packages/frontend/src/features/recurring-payments/index.tsx`** — re-export:

```ts
export { RecurringPaymentsPage as RecurringPayments } from './RecurringPaymentsPage';
```

The named export from `index.tsx` is what gets imported in `routes.tsx`, so keep it consistent with the other features (e.g. `export { Debts } from './DebtsPage'`).

---

## 7. Register the route

**File:** `packages/frontend/src/routes.tsx`

Add a lazy child route entry inside the `RequireAuth` block, matching the other
protected features:

```tsx
// inside the RequireAuth children array:
{
  path: 'recurring-payments',
  lazy: async () => ({
    Component: (await import('@/features/recurring-payments')).RecurringPayments,
  }),
},
```

The path here becomes the URL the user navigates to. All protected feature routes are siblings under the `/` parent, which renders the `Layout` via `RequireAuth`. Do not add anything to the `PublicOnly` block.

---

## 8. Tests

### Unit tests for pure logic

If your route file exports standalone validation or computation functions (as `debts.ts` does for `parseDebtPayload`, `computeDebtPrincipal`, etc.), write unit tests in a co-located `.test.ts` file.

**File:** `packages/backend/src/routes/recurring-payments.test.ts`

```ts
import { describe, expect, test } from 'bun:test';
import { parseCreate } from './recurring-payments'; // export the function to test it

describe('recurring payment payload validation', () => {
  test('accepts a valid payload', () => {
    const result = parseCreate({
      name: 'Netflix',
      amount: 15.99,
      currency: 'EUR',
      frequency: 'monthly',
      nextDueDate: '2026-04-01',
      category: 'Entertainment',
      color: '#e50914',
      emoji: '📺',
      notes: null,
    });
    expect(result.ok).toBe(true);
  });

  test('rejects an invalid frequency', () => {
    const result = parseCreate({
      name: 'Netflix',
      amount: 15.99,
      currency: 'EUR',
      frequency: 'weekly', // not in the allowed set
      nextDueDate: '2026-04-01',
      category: 'Entertainment',
      color: '#e50914',
      emoji: '📺',
    });
    expect(result).toEqual({ ok: false, error: 'Invalid frequency' });
  });
});
```

Run with `NODE_ENV=test bun test src/routes/recurring-payments.test.ts` from
`packages/backend`. If imports initialize a database client, select an isolated
database first.

### Integration (route-level) tests

For behaviour that requires the HTTP layer — ownership boundaries, unknown field rejection, CRUD happy paths — add a `describe` block to `packages/backend/src/routes/core.integration.test.ts`. Follow the pattern used for the existing `savings integration`, `budget integration`, and `goals integration` blocks.

```ts
describe('recurring payments integration', () => {
  test('covers CRUD and enforces ownership', async () => {
    const owner = await integration.signUp('recurring-owner');
    const intruder = await integration.signUp('recurring-intruder');

    // POST /api/recurring-payments
    const createResponse = await integration.request('/api/recurring-payments', {
      method: 'POST',
      cookie: owner.cookie,
      json: {
        name: 'Netflix',
        amount: 15.99,
        currency: 'EUR',
        frequency: 'monthly',
        nextDueDate: '2026-04-01',
        category: 'Entertainment',
        color: '#e50914',
        emoji: '📺',
        notes: null,
      },
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { data: { id: number } };

    // GET /api/recurring-payments — list
    const listResponse = await integration.request('/api/recurring-payments', {
      cookie: owner.cookie,
    });
    expect(listResponse.status).toBe(200);

    // Ownership check — intruder gets 404, not the record
    const crossResponse = await integration.request(`/api/recurring-payments/${created.data.id}`, {
      cookie: intruder.cookie,
    });
    expect(crossResponse.status).toBe(404);

    // DELETE
    const deleteResponse = await integration.request(`/api/recurring-payments/${created.data.id}`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    expect(deleteResponse.status).toBe(200);
  });
});
```

The `integration` helper comes from `src/test/integration.ts`. It wraps `app.request` (the Hono test client, no actual HTTP port needed), handles CSRF token forwarding automatically based on the cookie string, and exposes `integration.signUp(label)` to create an isolated test user. Each `describe` block should call `integration.cleanup()` in `beforeAll` and `afterAll` to remove any users created under the test's email domain. Use a distinct synthetic test domain and an isolated migrated database: cleanup is destructive for matching users.

### Access matrix

Every route you add also goes into the access matrix, which proves that other households, a
pending or former partner and anonymous callers get nothing. The matrix test fails and lists any
registered route that is not classified, so you will be told. In
`packages/backend/src/routes/accessMatrix.cases.ts`:

- add a `row` case for a route that takes an id, and a `cross` case for a body field that names a
  parent (account, mortgage, employment…); use `scope: 'joint'` only if an accepted partner may
  act on joint rows;
- add a `list` case for a collection and a `caller` case for a write that takes no id;
- or list the route in `EXEMPT_ROUTES` with the reason it needs no per-actor check.

For a new table with a `user_id` column, add a row to `seedRows` and the table to
`SNAPSHOT_TABLES` in `packages/backend/src/test/accessWorld.ts`, so the matrix can prove that a
refused request changes nothing. A new `eq(table.userId, …)` written outside `lib/access.ts` must
be recorded in `packages/backend/src/lib/accessSweep.test.ts`. See
[authorization and privacy tests](security.md#authorization-and-privacy-tests).

### UI component tests

Frontend tests use Bun. Shared UI smoke cases in
`packages/frontend/src/components/ui/shared-ui.smoke.test.tsx` render static markup;
feature pure-logic tests are co-located, and cache dependencies are tested in
`src/lib/queryInvalidation.test.ts`.

See [shared UI verification](shared-ui-verification.md) for the frontend and
Playwright commands and for manual QA; static rendering does not prove interactions
or visual layout.

---

## The capabilities system

### What it is

The capabilities system exposes a set of boolean flags to the frontend describing whether optional backend features are available at runtime. It is backed by `packages/backend/src/lib/capabilities.ts` and served from `GET /api/capabilities` (requires auth).

Currently there are three capabilities:

| Key                      | What it tracks                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `ai`                     | Whether AI features are operational (derived from the pension import worker state) |
| `pensionStatementImport` | Whether the pension import worker is running and healthy                           |
| `bunq`                   | Whether the complete optional bunq OAuth configuration is available                |

The AI and pension-import statuses depend on the worker heartbeat and parser
readiness. `bunq` is enabled by complete OAuth configuration; it is independent of
the pension worker. These statuses keep optional infrastructure from blocking core
features.

The frontend fetches capabilities on mount and re-polls every 15 seconds via `useAppCapabilities()` in `packages/frontend/src/lib/useAppCapabilities.ts`. Capabilities that are disabled are used to conditionally show or hide UI affordances (e.g. the PDF import button in the pensions feature).

### When to use it

Do **not** add a capability flag for a standard CRUD feature. Capabilities are reserved for features that depend on **optional infrastructure** — external workers, third-party services, or hardware — that may not be running in all deployments. Adding a flag for a feature that always works just adds noise.

Use a capability flag when:

- The feature requires an external process beyond the main Bun server and PostgreSQL
- That process may not be running in all environments (local dev, production, etc.)
- You want to gracefully degrade the UI when that process is absent

### How to add a new capability flag

**Step 1** — Add the key to the `AppCapabilities` type in `packages/shared/src/types/index.ts`:

```ts
export type AppCapabilities = {
  ai: AppCapabilityStatus;
  pensionStatementImport: AppCapabilityStatus;
  bunq: AppCapabilityStatus;
  myNewFeature: AppCapabilityStatus; // add here
};
```

**Step 2** — Implement the capability check in `packages/backend/src/lib/capabilities.ts`. Model it on `getPensionStatementImportCapability` for a worker-backed feature, or on `getBunqCapability` for one that depends only on configuration. Add your check function, then include the result in the object returned by `getAppCapabilities`:

```ts
export async function getAppCapabilities(now = new Date()): Promise<AppCapabilities> {
  const pensionStatementImport = await getPensionStatementImportCapability(now);
  return {
    ai: toAiCapability(pensionStatementImport, now),
    pensionStatementImport,
    bunq: getBunqCapability(now),
    myNewFeature: await getMyNewFeatureCapability(now),
  };
}
```

**Step 3** — Update the frontend default value in `packages/frontend/src/lib/useAppCapabilities.ts`:

```ts
export const DEFAULT_APP_CAPABILITIES: AppCapabilities = {
  // existing entries...
  myNewFeature: {
    enabled: false,
    reason: 'worker_unavailable',
    message: 'My new feature is unavailable.',
    checkedAt: new Date(0).toISOString(),
  },
};
```

**Step 4** — Consume the flag in the frontend:

```ts
const { data: capabilities } = useAppCapabilities();
const featureEnabled = capabilities?.myNewFeature.enabled ?? false;
```
