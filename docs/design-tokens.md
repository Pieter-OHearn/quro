# Design Tokens

Quro uses semantic CSS variables defined in
[`packages/frontend/src/styles/theme.css`](../packages/frontend/src/styles/theme.css)
to drive Tailwind utility classes. The goal is that shared UI primitives and
feature components describe **intent** (`bg-brand`, `text-fg-muted`,
`border-border-subtle`) rather than raw palette values (`bg-indigo-600`,
`text-slate-500`, `border-slate-100`).

Read the token block in `theme.css` for the full source-of-truth list. This
page covers when to use each token group, the rules for shared UI ownership, and
the table/list patterns feature work should follow.

## Token groups

| Group          | Tokens                                                                                       | Use for                                                                 |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Brand**      | `brand`, `brand-hover`, `brand-disabled`, `brand-border`, `brand-soft*`, `brand-fg`          | Primary actions, selected rows, active tabs, and brand-tinted surfaces  |
| **Surface**    | `surface`, `surface-sunken`, `surface-muted`, `surface-inverse*`                             | Page, card, table header, panel, hover, and inverse backgrounds         |
| **Border**     | `border-subtle`, `border-default`, `border-strong`                                           | Dividers, card borders, table row borders, and control outlines         |
| **Foreground** | `fg`, `fg-strong`, `fg-muted`, `fg-subtle`, `fg-faint`, `fg-disabled`, `fg-inverted`         | Text and icon hierarchy                                                 |
| **Status**     | `success`, `warning`, `danger`, `info` (each with `-fg`, `-soft`, `-soft-strong`, `-border`) | Badges, alerts, validation, and positive/negative financial state       |
| **Focus**      | `focus-ring`, `focus-ring-width`                                                             | `focus:ring-focus-ring` and visible focus outlines on interactive items |
| **Shadow**     | `shadow-card`, `shadow-popover`, `shadow-overlay`, `shadow-brand`                            | Elevation tiers for cards, popovers, overlays, and focused brand action |
| **Motion**     | `duration-fast` / `-base` / `-slow`, `ease-standard`, `ease-emphasized`                      | `transition-*`, `duration-*`, and easing utilities                      |
| **Radius**     | `radius-sm`, `radius-md`, `radius-lg`, `radius-xl`                                           | Shared control, card, modal, and table-card rounding                    |
| **Numeric**    | `font-numeric` utility class                                                                 | Money, rates, quantities, and other values that align across rows       |

## Rules

1. **In shared primitives** (anything under `packages/frontend/src/components/ui/`):
   use semantic tokens. Do not add raw Tailwind palette utilities like
   `bg-indigo-600` or `text-slate-500` when a token covers the use case.
2. **In feature components:** existing raw-palette usage is fine and does not
   need to migrate in a single pass. New shared primitives **must** use tokens
   from day one.
3. **Need a color that isn't covered?** Add a token to `theme.css` first, then
   use it. Don't reach for an ad-hoc Tailwind class.
4. **Visual baseline:** the current Quro look is the baseline. Token values map
   to the existing palette — they do not redesign the app. Designers can tune
   values later in `theme.css` without code changes.
5. **Border naming:** raw variables are named `--border-*`, but Tailwind color
   utilities include the utility prefix, so use classes like
   `border-border-default` and `border-border-subtle`.
6. **Do not bypass primitives:** when a shared primitive exists for a card,
   button, icon button, input, segmented control, pagination, table, or empty
   state, use it before adding one-off hardcoded Tailwind styling in a feature
   module.
7. **Feature modules may own domain color:** domain-specific positive/negative
   states can use local classes when no semantic token fits yet, but shared UI
   primitives should first add or reuse a semantic token.

## Adding a new token

1. Add the raw variable on `:root` in `theme.css`.
2. Map it inside the `@theme inline` block under the right namespace
   (`--color-*` for colors, `--shadow-*` for shadows, `--duration-*` /
   `--ease-*` for motion, `--radius-*` for radius) so it becomes a Tailwind
   utility.
3. Use it from primitives and update this doc if it introduces a new group.

## Dark mode

Quro does not have a dark mode today. When it is added, override the same raw
variables under a `.dark { … }` block in `theme.css` and toggle the class on
the document root — every token automatically picks up the new value at
runtime, so no component code has to change.

## Ownership boundaries

Shared UI owns visual consistency, responsive layout, accessibility mechanics,
and reusable interaction chrome. Components under
`packages/frontend/src/components/ui/` should expose small configuration props
for those concerns: tokenized color, density, header/footer slots, responsive
table behavior, row actions, pagination, loading, and empty states.

Feature modules own data, domain behavior, permissions, local sorting/filtering
state, copy, and custom cells. A feature should decide what a payslip, holding,
transaction, or import row means, then pass the resulting rows and handlers into
shared primitives. Do not move business rules into shared UI to avoid styling a
feature component.

## Table and list decision rules

Use `DataTable` for comparable records where columns carry meaning across rows:
salary payslips, debt payments, pension import review rows, investment holdings,
closed holdings, account balances, and future sortable/filterable datasets. Put
alignment, mobile labels, priority, widths, and numeric typography in the
`columns` config; row cells should reference columns with `columnKey`.

Use `TxnHistoryPanel` / `TxnRow` for chronological activity feeds where each row
is read as an event summary rather than compared column-by-column: mortgage,
pension, property, holding, and savings transaction histories. Keep these as
rows unless the UI needs desktop headers or aligned numeric comparison.

Use card grids for independent objects where scanning depends on object state or
visual grouping rather than shared columns: goal cards, property cards, account
cards, debt cards, and dashboard overview cards.

Current audit status and default direction:

| Surface                         | Decision                     | Notes                                                   |
| ------------------------------- | ---------------------------- | ------------------------------------------------------- |
| Salary payslip history          | `DataTable`                  | Financial table with selected rows.                     |
| Debt payment history            | `DataTable`                  | Compact financial table.                                |
| Investment active holdings      | `DataTable`                  | Expandable financial table.                             |
| Investment closed holdings      | `DataTable`                  | Expandable financial table.                             |
| Pension statement import review | `DataTable`                  | Editable review table.                                  |
| Transaction history panels      | `TxnHistoryPanel` / `TxnRow` | Event feeds; do not force into tables by default.       |
| Budget categories               | Follow-up audit              | Likely table-like because budget/spent columns compare. |
| Recent transactions             | Row list                     | Activity feed, not a comparative table.                 |

## `DataTable` usage

Import the table shell and row primitives from the shared UI barrel:

```tsx
import {
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  RowActions,
  type DataTableColumn,
  type DataTableSortState,
} from '@/components/ui';
```

Define columns outside render when possible. The column config is the source of
truth for desktop headers and mobile card labels.

```tsx
const PAYMENT_COLUMNS: readonly DataTableColumn[] = [
  {
    key: 'date',
    header: 'Date',
    mobileLabel: 'Date',
    priority: 'primary',
    sortable: true,
    defaultSortDirection: 'desc',
  },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    mobileLabel: 'Amount',
    numeric: true,
    sortable: true,
    defaultSortDirection: 'desc',
    cellClassName: 'font-semibold text-fg-strong',
  },
  {
    key: 'interest',
    header: 'Interest',
    align: 'right',
    mobileLabel: 'Interest',
    priority: 'secondary',
    numeric: true,
  },
  { key: 'actions', header: '', priority: 'actions', width: 48 },
];
```

Render rows with `DataTableRow` and `DataTableCell`. Prefer `columnKey` over
repeating alignment, labels, numeric styling, and priority on every cell.

```tsx
<DataTable
  title="Payment History"
  subtitle={`${payments.length} payments`}
  action={
    <Button onClick={onLogPayment} variant="primary" size="sm">
      Log Payment
    </Button>
  }
  columns={PAYMENT_COLUMNS}
  sort={sort}
  onSortChange={setSort}
  isEmpty={payments.length === 0}
  emptyState="No payments recorded yet."
  minWidth={720}
  tableLayout="fixed"
  tableVariant="financial"
>
  {sortedPayments.map((payment) => (
    <DataTableRow key={payment.id} interactive>
      <DataTableCell columnKey="date">{formatShortDate(payment.date)}</DataTableCell>
      <DataTableCell columnKey="amount">{fmtNative(payment.amount)}</DataTableCell>
      <DataTableCell columnKey="interest">{fmtNative(payment.interest)}</DataTableCell>
      <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
        <RowActions>{/* icon buttons */}</RowActions>
      </DataTableCell>
    </DataTableRow>
  ))}
</DataTable>
```

### Mobile behavior and priority

`DataTable` renders normal table headers on desktop and card-like rows on
mobile. The desktop header is hidden under the medium breakpoint. Each mobile
cell shows a label from `mobileLabel`, falling back to `header` when the header
is plain text.

Use `priority` to decide what survives on mobile:

| Priority    | Mobile behavior                    | Use for                                             |
| ----------- | ---------------------------------- | --------------------------------------------------- |
| `primary`   | Visible                            | Identity, current value, total, key status          |
| `secondary` | Hidden below the medium breakpoint | Supporting values that are useful but not essential |
| `tertiary`  | Hidden below the medium breakpoint | Rarely needed comparison data or audit details      |
| `actions`   | Visible                            | Row menus, edit/delete buttons, expansion controls  |

Choose `primary` columns by reading one mobile card in isolation. A user should
understand the object, its current state, and the available row actions without
secondary columns. Keep high-density numeric comparison on desktop by setting
`minWidth` and `tableLayout="fixed"` when columns need stable widths.

Use `numeric: true` for money, quantities, rates, and percentages. It applies
the shared `font-numeric` utility and should usually be paired with
`align: 'right'`.

### Table slots

Use `toolbar` for commands that change the table view or batch behavior, such as
search, density controls, export, or bulk actions. Use `filters` for active
domain filters that narrow the dataset. Use `footer` for pagination, result
counts, totals, or secondary table status.

```tsx
<DataTable
  columns={columns}
  toolbar={<BulkActions selectedCount={selectedIds.length} onClear={clearSelection} />}
  filters={
    <TransactionFilters
      category={category}
      status={status}
      onCategoryChange={setCategory}
      onStatusChange={setStatus}
    />
  }
  footer={
    <Pagination
      page={page}
      totalPages={totalPages}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      totalCount={totalCount}
      onChange={setPage}
    />
  }
>
  {rows}
</DataTable>
```

### Empty and loading states

Use the `isEmpty`, `emptyState`, `isLoading`, and `loadingState` props instead
of branching around the table shell. That keeps header, filters, footer, and
responsive spacing stable while data changes.

```tsx
<DataTable
  columns={columns}
  isLoading={query.isLoading}
  loadingState="Loading payslips..."
  isEmpty={!query.isLoading && payslips.length === 0}
  emptyState={
    <>
      No payslips yet. Click <strong>Add Payslip</strong> to get started.
    </>
  }
>
  {payslips.map((payslip) => (
    <PayslipRow key={payslip.id} payslip={payslip} />
  ))}
</DataTable>
```

### Row actions

Keep row actions in an `actions` column and use shared action primitives. Stop
event propagation when an action lives inside an interactive row so clicking
`Edit`, `Delete`, or `Download` does not also select or expand the row.

```tsx
<DataTableRow onClick={() => onSelect(row.id)} interactive selected={row.id === selectedId}>
  <DataTableCell columnKey="name">{row.name}</DataTableCell>
  <DataTableCell columnKey="amount">{fmt(row.amount)}</DataTableCell>
  <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
    <RowActions>
      <IconButton
        icon={Edit3}
        label="Edit row"
        title="Edit row"
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onEdit(row);
        }}
      />
    </RowActions>
  </DataTableCell>
</DataTableRow>
```

### Custom domain cells

Custom cells belong in feature modules. Build a small feature-local component
for domain formatting, then render it inside `DataTableCell`. Let `DataTable`
handle the outer cell layout and responsive labels.

```tsx
function HoldingAssetCell({ holding }: { holding: Holding }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xs font-bold text-brand-fg">
        {holding.ticker.slice(0, 2)}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg-strong">{holding.name}</p>
        <p className="text-xs text-fg-faint">{holding.ticker}</p>
      </div>
    </div>
  );
}

<DataTableCell columnKey="asset">
  <HoldingAssetCell holding={holding} />
</DataTableCell>;
```

## `TxnHistoryPanel` usage

Use `TxnHistoryPanel` for chronological event feeds where users scan activity
by date, type, and amount. It owns the panel shell, filter bar, optional stats,
add action, empty message, and footer. Feature modules own the transaction rows,
filter value, pagination state, and handlers.

```tsx
<TxnHistoryPanel
  title="Transaction History"
  subtitle={`${transactions.length} transactions`}
  filterOptions={[
    { key: 'all', label: 'All' },
    { key: 'deposit', label: 'Deposits' },
    { key: 'withdrawal', label: 'Withdrawals' },
  ]}
  filter={filter}
  onFilterChange={setFilter}
  stats={[
    { label: 'In', value: fmt(inflow), color: 'text-success-fg' },
    { label: 'Out', value: fmt(outflow), color: 'text-danger-fg' },
  ]}
  onAdd={onAddTransaction}
  addLabel="Add Transaction"
  emptyMessage="No transactions match this filter."
  footer={
    <Pagination
      page={page}
      totalPages={totalPages}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      totalCount={totalCount}
      onChange={setPage}
    />
  }
  isEmpty={transactions.length === 0}
>
  {transactions.map((transaction) => (
    <TxnRow
      key={transaction.id}
      icon={transaction.type === 'deposit' ? ArrowUpRight : ArrowDownRight}
      iconColor={transaction.type === 'deposit' ? 'text-success-fg' : 'text-danger-fg'}
      iconBg={transaction.type === 'deposit' ? 'bg-success-soft' : 'bg-danger-soft'}
      date={transaction.date}
      label={transaction.note ?? 'Transaction'}
      amount={fmt(transaction.amount)}
      onEdit={() => onEdit(transaction)}
      onDelete={() => onDelete(transaction.id)}
    />
  ))}
</TxnHistoryPanel>
```

Reach for `DataTable` instead when the same records need desktop headers,
sortable columns, aligned comparison, column priority, or custom table footer
totals. Do not recreate a one-off card list with hardcoded borders and filters
when `TxnHistoryPanel` already fits the feed shape.
