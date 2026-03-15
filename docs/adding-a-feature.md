# Adding a New Feature Module — End-to-End Guide

This guide walks through adding a new feature from scratch, following the exact patterns used in the existing codebase. The example used throughout is **recurring payments** — a feature that lets users track fixed recurring expenses (subscriptions, standing orders, etc.).

The same steps apply to any new resource: swap the names and adjust the fields.

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

Export everything from the top-level `index.ts` — there is no barrel file to update, everything lives in this single file.

---

## 2. Database schema

**File:** `packages/backend/src/db/schema.ts`

Add a new `pgTable` definition. The pattern across all existing tables is consistent:

- `id: serial('id').primaryKey()`
- `userId: integer('user_id').references(() => users.id).notNull()`
- Monetary amounts use `numeric('col', { precision: 19, scale: 2 })` — Drizzle returns these as strings, so normalize them in the frontend or backend layer
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
    amount: numeric('amount', { precision: 19, scale: 2 }).notNull(),
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

After editing the schema, generate and apply the migration:

```bash
# from packages/backend
bun run db:generate   # generates a new migration file under src/db/migrations/
bun run db:migrate    # applies it to the database
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
    .values({ ...body.value, userId: user.id, amount: body.value.amount.toString() })
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
    .set({
      ...body.value,
      ...(body.value.amount != null ? { amount: body.value.amount.toString() } : {}),
    })
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
- Strip any client-supplied `userId` from the body before acting on it. The `rejectUnknownFields` call enforces the allowlist; `userId` is included in the implicit allowlist inside `rejectUnknownFields` itself and will be silently ignored rather than rejected.
- `numeric` columns must be written as strings (`.toString()`) when inserting or updating via Drizzle.

---

## 4. Mount the route

**File:** `packages/backend/src/index.ts`

Add two lines: one to apply `requireAuth` to the path prefix and one to mount the Hono app.

```ts
import recurringPayments from './routes/recurring-payments';

// in the "Protected routes" section:
app.use('/api/recurring-payments/*', requireAuth);

// in the route mounting section:
app.route('/api/recurring-payments', recurringPayments);
```

Follow the same ordering convention as the existing entries — middleware registrations first, then route mounts.

---

## 5. Frontend hooks

**Directory:** `packages/frontend/src/features/recurring-payments/hooks/`

Create one file per hook and an `index.ts` barrel. The pattern is identical across all existing features:

**`useRecurringPayments.ts`** — query hook:

```ts
import { useQuery } from '@tanstack/react-query';
import type { RecurringPayment } from '@quro/shared';
import { api } from '@/lib/api';

export function useRecurringPayments() {
  return useQuery({
    queryKey: ['recurring-payments'],
    queryFn: async () => {
      const { data } = await api.get('/api/recurring-payments');
      return data.data as RecurringPayment[];
    },
  });
}
```

**`useCreateRecurringPayment.ts`** — mutation hook:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RecurringPayment } from '@quro/shared';
import { api } from '@/lib/api';

export function useCreateRecurringPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Omit<RecurringPayment, 'id'>) => {
      const { data } = await api.post('/api/recurring-payments', payload);
      return data.data as RecurringPayment;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-payments'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

**Critical:** every mutation's `onSuccess` must invalidate both the feature's own query key **and** `['dashboard']`. The dashboard aggregates data from multiple features; skipping the dashboard invalidation means the dashboard will show stale totals after a create, update, or delete. This pattern is used consistently across `useCreateDebt`, `useUpdateDebt`, `useDeleteDebt`, and their equivalents in every other feature.

**`useDeleteRecurringPayment.ts`**:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDeleteRecurringPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/recurring-payments/${id}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['recurring-payments'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
```

**`hooks/index.ts`** — barrel:

```ts
export { useRecurringPayments } from './useRecurringPayments';
export { useCreateRecurringPayment } from './useCreateRecurringPayment';
export { useDeleteRecurringPayment } from './useDeleteRecurringPayment';
```

The Axios instance (`src/lib/api.ts`) is configured with `baseURL = VITE_API_URL` and `withCredentials: true`. Do not construct URLs with a hardcoded origin; just use the path.

---

## 6. Frontend page component

**File:** `packages/frontend/src/features/recurring-payments/RecurringPaymentsPage.tsx`

Create the page component. Import the hooks from the local `hooks/` barrel. The existing feature pages (e.g. `DebtsPage.tsx`) are large self-contained files that combine the list view, modals, and forms; follow the same pattern.

```tsx
import { useRecurringPayments, useDeleteRecurringPayment } from './hooks';
import { LoadingState, EmptyState, ContentSection } from '@/components/ui';

export function RecurringPaymentsPage() {
  const { data: payments, isLoading } = useRecurringPayments();
  const deletePayment = useDeleteRecurringPayment();

  if (isLoading) return <LoadingState />;
  if (!payments?.length) return <EmptyState message="No recurring payments yet." />;

  return (
    <ContentSection title="Recurring Payments">
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

Add an import and a child route entry inside the `RequireAuth` block:

```tsx
import { RecurringPayments } from '@/features/recurring-payments';

// inside the RequireAuth children array:
{ path: 'recurring-payments', Component: RecurringPayments },
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

Run with `bun test` from `packages/backend`.

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

The `integration` helper comes from `src/test/integration.ts`. It wraps `app.request` (the Hono test client, no actual HTTP port needed), handles CSRF token forwarding automatically based on the cookie string, and exposes `integration.signUp(label)` to create an isolated test user. Each `describe` block should call `integration.cleanup()` in `beforeAll` and `afterAll` to remove any users created under the test's email domain.

### UI component tests

There are no existing frontend tests, so there is no established pattern to follow. If you add them, use Bun's test runner or Vitest with a jsdom environment. Keep them optional until a standard emerges.

---

## The capabilities system

### What it is

The capabilities system exposes a set of boolean flags to the frontend describing whether optional backend features are available at runtime. It is backed by `packages/backend/src/lib/capabilities.ts` and served from `GET /api/capabilities` (requires auth).

Currently there are two capabilities:

| Key                      | What it tracks                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `ai`                     | Whether AI features are operational (derived from the pension import worker state) |
| `pensionStatementImport` | Whether the pension import worker is running and healthy                           |

Both depend on an external worker process. The capability is determined by inspecting the `worker_heartbeats` table: if the worker has not sent a heartbeat recently, or if the parser service it depends on is unhealthy, the capability is disabled.

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
  myNewFeature: AppCapabilityStatus; // add here
};
```

**Step 2** — Implement the capability check in `packages/backend/src/lib/capabilities.ts`. Model it on `getPensionStatementImportCapability`. Add your check function, then include the result in the object returned by `getAppCapabilities`:

```ts
export async function getAppCapabilities(now = new Date()): Promise<AppCapabilities> {
  const pensionStatementImport = await getPensionStatementImportCapability(now);
  return {
    ai: toAiCapability(pensionStatementImport, now),
    pensionStatementImport,
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
