/// <reference types="bun-types" />

import { describe, expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertTriangle, ArrowDownUp, Pencil, PiggyBank, Plus } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { CurrencyContext, type CurrencyContextType } from '@/lib/currencyContextValue';
import { Badge } from './atoms/Badge';
import { Button } from './atoms/Button';
import { Card } from './atoms/Card';
import { Change } from './atoms/Change';
import { CurrencyInput } from './atoms/CurrencyInput';
import { DateInput } from './atoms/DateInput';
import { IconButton } from './atoms/IconButton';
import { LoadingSpinner } from './atoms/LoadingSpinner';
import { PasswordInput } from './atoms/PasswordInput';
import { ProgressMeter } from './atoms/ProgressMeter';
import { QuroLogo } from './atoms/QuroLogo';
import { SelectInput } from './atoms/SelectInput';
import { Spinner } from './atoms/Spinner';
import { Textarea } from './atoms/Textarea';
import { TextInput } from './atoms/TextInput';
import { DateNoteRow } from './molecules/DateNoteRow';
import { EmptyState } from './molecules/EmptyState';
import { FormField } from './molecules/FormField';
import { LoadingState } from './molecules/LoadingState';
import { Pagination } from './molecules/Pagination';
import { PanelHeader } from './molecules/PanelHeader';
import { RowActions } from './molecules/RowActions';
import { SegmentedControl } from './molecules/SegmentedControl';
import { nextTabIndex } from './molecules/SegmentedControl/SegmentedControl';
import { TxnTypeSelector } from './molecules/TxnTypeSelector';
import { ArchiveOrDeleteDialog } from './organisms/ArchiveOrDeleteDialog';
import { ChartCard } from './organisms/ChartCard';
import { DataTable, DataTableCell, DataTableRow } from './organisms/DataTable';
import { Modal, ModalFooter } from './organisms/Modal';
import { StatCard } from './organisms/StatCard';
import { TxnHistoryPanel, TxnRow } from './organisms/TxnHistoryPanel';
import { ContentSection, PageStack } from './templates';

type SmokeCase = {
  name: string;
  element: ReactElement;
  includes: readonly string[];
  excludes?: readonly string[];
};

const noop = () => {};

const smokeCurrency = {
  baseCurrency: 'EUR',
  fmtNative: (amount: number, currency: string) => `${currency} ${amount.toFixed(2)}`,
} as unknown as CurrencyContextType;

const smokeCases: readonly SmokeCase[] = [
  {
    name: 'Badge renders shared badge copy',
    element: (
      <Badge data-smoke="badge" tone="warning">
        Pending
      </Badge>
    ),
    includes: [
      'data-smoke="badge"',
      'Pending',
      'rounded-sm border text-[11px] leading-4 font-medium',
      'border-warning bg-warning-soft text-warning',
    ],
    excludes: ['rounded-full'],
  },
  {
    name: 'Badge neutral tone is an outline on the card surface',
    element: <Badge>Soon</Badge>,
    includes: ['px-1.5 py-px', 'border-border-default text-fg-muted'],
    excludes: ['bg-'],
  },
  {
    name: 'Button renders loading state markup',
    element: (
      <Button loading loadingLabel="Saving item" variant="primary">
        Save
      </Button>
    ),
    includes: ['aria-busy="true"', 'Saving item', 'rounded-md'],
  },
  {
    name: 'Button sizes take their height from the density scale',
    element: (
      <div>
        <Button size="sm">Small</Button>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
        <Button size="xl">Main</Button>
      </div>
    ),
    includes: [
      'h-7 max-sm:h-11 rounded-md px-2 text-label',
      'h-8 max-sm:h-11 rounded-md px-3 text-cell',
      'h-11 rounded-lg px-4 text-body',
      'h-12 rounded-lg px-4 text-title-section font-semibold',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
      'hover:bg-brand-hover active:bg-brand-hover disabled:bg-surface-muted disabled:text-fg-subtle',
    ],
    excludes: ['py-', 'text-sm', 'text-xs', 'text-[13px]'],
  },
  {
    name: 'Button secondary variant has a control border on the surface',
    element: <Button variant="secondary">Cancel</Button>,
    includes: ['border border-border-control bg-surface text-fg'],
  },
  {
    name: 'IconButton keeps its label and renders square sizes',
    element: (
      <div>
        <IconButton icon={Pencil} label="Edit row" size="sm" />
        <IconButton icon={Pencil} label="Rename" />
      </div>
    ),
    includes: [
      'aria-label="Edit row"',
      'aria-label="Rename"',
      'h-7 w-7 max-sm:h-11 max-sm:w-11 rounded-md',
      'h-8 w-8 max-sm:h-11 max-sm:w-11 rounded-md',
      'focus-visible:outline-focus-ring',
    ],
  },
  {
    name: 'Card renders wrapper and children',
    element: (
      <Card data-smoke="card" padding="none">
        Card body
      </Card>
    ),
    includes: [
      'data-smoke="card"',
      'Card body',
      'rounded-lg border border-border-default bg-surface',
    ],
    excludes: ['shadow-', 'p-4'],
  },
  {
    name: 'Card default padding is 16px, with 12px corners on a phone',
    element: <Card>Padded</Card>,
    includes: ['rounded-lg', 'max-sm:rounded-xl', 'p-4'],
  },
  {
    name: 'ChartCard keeps the row below the chart when there is no data',
    element: (
      <ChartCard title="Net worth" hasData={false} belowContent={<span>Range control</span>}>
        <span>Chart</span>
      </ChartCard>
    ),
    includes: ['No data yet.', 'border-t border-border-subtle px-4 py-2', 'Range control'],
    excludes: ['Chart<'],
  },
  {
    name: 'ProgressMeter renders a thin secondary meter by default',
    element: <ProgressMeter value={40} label="Goal progress" />,
    includes: [
      'role="progressbar"',
      'aria-valuenow="40"',
      'h-1.5 overflow-hidden rounded-full bg-surface-muted',
      'bg-secondary',
      'width:40%',
    ],
    // The fill does not animate.
    excludes: ['transition'],
  },
  {
    name: 'StatCard link renders a bordered card without a shadow',
    element: (
      <MemoryRouter>
        <StatCard
          label="Total savings"
          value="EUR 1,250.00"
          href="/savings"
          testId="smoke-stat-card"
        />
      </MemoryRouter>
    ),
    includes: [
      'data-testid="smoke-stat-card"',
      'href="/savings"',
      'rounded-lg border border-border-default bg-surface px-4 py-3',
      'text-label text-fg-muted',
      'text-figure-lg',
      'Total savings',
    ],
    excludes: ['shadow-', 'w-10 h-10', 'bg-success-soft'],
  },
  {
    name: 'Change renders a signed loss chip with a hidden arrow',
    element: <Change value={-612.75} format="amount" variant="chip" />,
    includes: [
      '<span aria-hidden="true">\u25BC</span>',
      '<span class="sr-only">down </span>',
      '\u2212612.75',
      'text-loss',
      'bg-loss-soft',
    ],
  },
  {
    name: 'Spinner renders accessible svg markup',
    element: <Spinner aria-label="Saving spinner" size="lg" tone="brand" />,
    includes: ['aria-label="Saving spinner"', 'animate-spin'],
  },
  {
    name: 'LoadingSpinner renders status role and label',
    element: <LoadingSpinner compact label="Loading balances" />,
    includes: ['role="status"', 'Loading balances'],
  },
  {
    name: 'TextInput renders value and invalid state',
    element: (
      <TextInput
        type="email"
        placeholder="name@example.com"
        value="demo@quro.local"
        error
        onChange={noop}
      />
    ),
    includes: [
      'type="email"',
      'placeholder="name@example.com"',
      'value="demo@quro.local"',
      'aria-invalid="true"',
      'border-danger bg-surface',
    ],
  },
  {
    name: 'TextInput is 32px with a control border, 44px on phones, in the field type style',
    element: <TextInput value="" onChange={noop} aria-label="Name" />,
    includes: [
      'h-8 max-sm:h-11 rounded-md border text-field',
      'px-2 border-border-control bg-surface',
      'focus:outline-2 focus:outline-offset-1 focus:outline-focus-ring',
    ],
    excludes: ['bg-surface-sunken', 'py-'],
  },
  {
    name: 'SelectInput renders shared options',
    element: (
      <SelectInput
        aria-label="Currency"
        value="gbp"
        error
        options={[
          { value: 'eur', label: 'EUR' },
          { value: 'gbp', label: 'GBP' },
        ]}
        onChange={noop}
      />
    ),
    includes: ['aria-label="Currency"', 'aria-invalid="true"', '>EUR</option>', '>GBP</option>'],
  },
  {
    name: 'CurrencyInput renders currency prefix and numeric input',
    element: <CurrencyInput currency="EUR" value="1250.50" onChange={noop} />,
    includes: [
      '>EUR</span>',
      'type="number"',
      'step="0.01"',
      'value="1250.50"',
      'pl-12 text-right font-numeric',
    ],
  },
  {
    name: 'DateInput renders date field markup',
    element: <DateInput value="2026-03-10" onChange={noop} />,
    includes: ['type="date"', 'value="2026-03-10"'],
  },
  {
    name: 'Textarea renders rows and content',
    element: <Textarea rows={4} placeholder="Add note" value="Shared note" onChange={noop} />,
    includes: [
      'rows="4"',
      'placeholder="Add note"',
      'Shared note',
      'px-2 py-2',
      'h-auto max-sm:h-auto resize-none',
    ],
    excludes: ['h-8', 'max-sm:h-11'],
  },
  {
    name: 'PasswordInput renders toggle button and masked input',
    element: <PasswordInput value="password123" show={false} onChange={noop} onToggle={noop} />,
    includes: [
      'type="password"',
      'value="password123"',
      'aria-label="Show password"',
      'pr-8 max-sm:pr-11',
      'absolute inset-y-0 right-0 flex w-8 max-sm:w-11 items-center justify-center rounded-md',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
    ],
  },
  {
    name: 'QuroLogo renders the one-colour V1 mark in text-brand',
    element: <QuroLogo />,
    includes: [
      'width="36"',
      'viewBox="0 0 32 32"',
      'class="text-brand"',
      'role="img"',
      'aria-label="Quro logo mark"',
      '<rect x="9" y="8" width="13" height="13" rx="4.5" stroke="currentColor" stroke-width="3">',
      '<path d="M18 17 L25 24" stroke="currentColor" stroke-width="3" stroke-linecap="round">',
    ],
    excludes: ['linearGradient', 'url(#', '<circle', '<stop', 'fill="#', 'stroke="#'],
  },
  {
    name: 'QuroLogo takes its colour from a caller text class',
    element: <QuroLogo size={20} className="text-fg-inverted shrink-0" />,
    includes: ['width="20"', 'height="20"', 'class="text-fg-inverted shrink-0"'],
    excludes: ['text-brand'],
  },
  {
    name: 'FormField renders label, hint, and error copy',
    element: (
      <FormField label="Amount" required hint="optional" error="Required field">
        <TextInput value="" onChange={noop} />
      </FormField>
    ),
    includes: [
      'Amount',
      'optional',
      'Required field',
      'mb-1 block text-label text-fg-muted',
      'font-normal text-fg-subtle',
      'mt-1 text-caption text-danger',
      'role="alert"',
      'data-field-error=""',
      'scroll-mb-28',
    ],
    excludes: ['text-xs', 'font-semibold', 'text-fg-faint font-normal'],
  },
  {
    name: 'FormField without an error is not marked and announces nothing',
    element: (
      <FormField label="Amount">
        <TextInput value="" onChange={noop} />
      </FormField>
    ),
    includes: ['Amount'],
    excludes: ['data-field-error', 'role="alert"'],
  },
  {
    name: 'PanelHeader renders title, subtitle, and action',
    element: (
      <PanelHeader
        title="Recent transactions"
        subtitle="Updated just now"
        action={<Button size="sm">Add transaction</Button>}
      />
    ),
    includes: [
      'Recent transactions',
      'Updated just now',
      'Add transaction',
      'border-b border-border-default min-h-9 px-3 py-1 max-sm:min-h-11 max-sm:px-4',
      'text-title-section text-fg',
      'text-caption text-fg-subtle',
      'flex shrink-0 items-center gap-2',
    ],
    excludes: ['px-6', 'py-5', 'text-fg-faint'],
  },
  {
    name: 'EmptyState renders shared CTA shell',
    element: (
      <EmptyState
        icon={AlertTriangle}
        title="No mortgages yet"
        description="Add your first mortgage to get started."
        action={{ label: 'Add mortgage', onClick: noop, icon: <Plus size={14} /> }}
      />
    ),
    includes: [
      'No mortgages yet',
      'Add your first mortgage to get started.',
      'Add mortgage',
      'items-start rounded-lg border border-dashed border-border-control bg-surface text-left px-4 py-6',
      'text-body font-semibold text-fg',
      'mt-1 text-cell text-fg-muted',
      'h-8 max-sm:h-11',
      'bg-brand text-fg-inverted',
    ],
    excludes: [
      'text-center',
      'items-center justify-center text-center',
      'h-16 w-16',
      'bg-brand-soft',
    ],
  },
  {
    name: 'EmptyState compact keeps 16px padding and a resting icon',
    element: (
      <EmptyState
        icon={AlertTriangle}
        title="All caught up"
        description="Nothing to review."
        compact
        tone="neutral"
      />
    ),
    includes: ['border-dashed', 'p-4', 'text-fg-faint', 'aria-hidden="true"'],
    excludes: ['<button', 'py-10'],
  },
  {
    name: 'LoadingState renders shared loading alias',
    element: <LoadingState label="Loading salary data" />,
    includes: ['role="status"', 'Loading salary data'],
  },
  {
    name: 'SegmentedControl renders active selection semantics',
    element: (
      <SegmentedControl
        variant="underline"
        value="2026"
        onChange={noop}
        options={[
          { value: '2025', label: '2025' },
          { value: '2026', label: '2026' },
        ]}
      />
    ),
    includes: [
      'role="tablist"',
      'aria-selected="true"',
      '>2025<',
      '>2026<',
      'border-b-2',
      'border-brand font-semibold text-fg',
    ],
    excludes: ['bg-brand-soft'],
  },
  {
    name: 'SegmentedControl is one bordered group with a brand-soft selection',
    element: (
      <SegmentedControl
        variant="pill"
        value="month"
        onChange={noop}
        options={[
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />
    ),
    includes: [
      'role="group"',
      'aria-pressed="true"',
      'aria-pressed="false"',
      'inline-flex max-w-full overflow-x-auto rounded-md border border-border-control max-sm:flex',
      'h-[26px]',
      'border-r border-border-control',
      'last:border-r-0',
      'max-sm:h-11 max-sm:flex-1',
      'text-label',
      'focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
      'bg-brand-soft font-semibold text-brand-fg',
      'bg-surface text-fg-muted',
    ],
    excludes: ['bg-brand ', 'bg-surface-inverse', 'text-fg-inverted', 'rounded-full', 'flex-wrap'],
  },
  {
    name: 'SegmentedControl contained and soft variants render the same group',
    element: (
      <div>
        <SegmentedControl
          variant="contained"
          value="a"
          onChange={noop}
          options={[{ value: 'a', label: 'A' }]}
        />
        <SegmentedControl
          variant="soft"
          value="a"
          onChange={noop}
          options={[{ value: 'a', label: 'A' }]}
        />
      </div>
    ),
    includes: ['border border-border-control', 'bg-brand-soft font-semibold text-brand-fg'],
    excludes: ['bg-brand ', ' p-1 ', 'gap-1.5 bg-surface'],
  },
  {
    name: 'Pagination renders range and current page marker',
    element: (
      <Pagination
        page={3}
        totalPages={7}
        rangeStart={21}
        rangeEnd={30}
        totalCount={63}
        onChange={noop}
      />
    ),
    includes: [
      '21-30 of 63',
      'aria-label="Previous page"',
      'aria-label="Next page"',
      'aria-current="page"',
      'text-caption font-numeric text-fg-muted',
      'h-7 w-7 items-center justify-center rounded-md border border-border-control text-caption font-numeric',
      'max-sm:h-11 max-sm:w-11',
      'bg-brand-soft font-semibold text-brand-fg',
      'bg-surface text-fg hover:bg-surface-muted',
      'disabled:border-border-default disabled:bg-surface disabled:text-fg-faint',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring',
    ],
    excludes: ['bg-brand text-fg-inverted', 'disabled:opacity-40'],
  },
  {
    name: 'RowActions renders child action group',
    element: (
      <RowActions data-smoke="row-actions">
        <button type="button">Edit</button>
        <button type="button">Delete</button>
      </RowActions>
    ),
    includes: ['data-smoke="row-actions"', 'Edit', 'Delete'],
  },
  {
    name: 'DataTable renders desktop table and custom row cells',
    element: (
      <DataTable
        title="Transactions"
        subtitle="2 rows"
        columns={[
          { key: 'name', header: 'Name', width: '60%' },
          { key: 'amount', header: 'Amount', align: 'right', width: '40%' },
        ]}
      >
        <DataTableRow>
          <DataTableCell columnKey="name">Rent</DataTableCell>
          <DataTableCell columnKey="amount">EUR 1,250.00</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: ['Transactions', '<table', '<thead', '<tbody', 'Rent', 'EUR 1,250.00'],
  },
  {
    name: 'DataTable renders sortable column headers',
    element: (
      <DataTable
        title="Sortable transactions"
        columns={[
          { key: 'name', header: 'Name', sortable: true },
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            sortable: true,
            defaultSortDirection: 'desc',
          },
        ]}
        sort={{ columnKey: 'amount', direction: 'desc' }}
        onSortChange={noop}
      >
        <DataTableRow>
          <DataTableCell columnKey="name">Rent</DataTableCell>
          <DataTableCell columnKey="amount">EUR 1,250.00</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: [
      'aria-sort="none"',
      'aria-sort="descending"',
      'aria-label="Sort by amount ascending"',
      'Sort by name',
    ],
  },
  {
    name: 'DataTable renders mobile metadata and lower priority cells',
    element: (
      <DataTable
        title="Accounts"
        columns={[
          { key: 'account', header: 'Account', mobileLabel: 'Account', priority: 'primary' },
          { key: 'note', header: 'Note', mobileLabel: 'Note', priority: 'secondary' },
        ]}
      >
        <DataTableRow interactive selected>
          <DataTableCell columnKey="account">Checking</DataTableCell>
          <DataTableCell columnKey="note">Hidden on mobile</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: [
      'data-priority="secondary"',
      'data-mobile-label="Note"',
      'max-md:hidden',
      'max-md:rounded-lg',
      'Checking',
      'Hidden on mobile',
    ],
    excludes: ['shadow-'],
  },
  {
    name: 'DataTable phone cards place cells by role and keep the generic layout elsewhere',
    element: (
      <DataTable
        columns={[
          { key: 'name', header: 'Asset', phoneCard: 'title' },
          { key: 'units', header: 'Units', phoneCard: 'metric' },
          {
            key: 'cost',
            header: 'Avg cost',
            priority: 'secondary',
            phoneCard: 'hiddenUntilDetails',
          },
          { key: 'value', header: 'Value', phoneCard: 'headline' },
          { key: 'gain', header: 'Gain', phoneCard: 'headlineNote' },
          { key: 'actions', header: '', priority: 'actions' },
        ]}
      >
        <DataTableRow interactive>
          <DataTableCell columnKey="name">Global ETF</DataTableCell>
          <DataTableCell columnKey="units">40</DataTableCell>
          <DataTableCell columnKey="cost">95.50</DataTableCell>
          <DataTableCell columnKey="value">4,496.00</DataTableCell>
          <DataTableCell columnKey="gain">+676.00</DataTableCell>
          <DataTableCell columnKey="actions">
            <button type="button">Edit holding</button>
          </DataTableCell>
        </DataTableRow>
        <DataTableRow data-total cardDetails={false}>
          <DataTableCell columnKey="name">Total</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: [
      'max-md:grid-cols-12',
      'max-md:order-1',
      'max-md:order-2',
      'max-md:order-3',
      'max-md:order-4',
      'max-md:order-6',
      // One metric shares the row with nothing else; the revealed one stays hidden until details.
      'max-md:col-span-12',
      'max-md:group-data-details-open:block',
      // A headline with a note under it keeps its label for assistive technology only.
      'class="text-label text-fg-muted max-md:block sr-only">Value</span>',
      'class="text-label text-fg-muted max-md:block hidden">Units</span>',
      'Show details',
      'Edit holding',
    ],
    // The title and the note have no label of their own, and the total row has no details button.
    excludes: ['>Asset</span>', '>Gain</span>', 'shadow-'],
  },
  {
    name: 'DataTable phone cards show the headline label when no note stands under it',
    element: (
      <DataTable
        columns={[
          { key: 'month', header: 'Month', phoneCard: 'title' },
          { key: 'gross', header: 'Gross', phoneCard: 'metric' },
          { key: 'bonus', header: 'Bonus', phoneCard: 'metric' },
          { key: 'tax', header: 'Tax', phoneCard: 'metric' },
          { key: 'net', header: 'Net pay', mobileLabel: 'Net pay', phoneCard: 'headline' },
        ]}
      >
        <DataTableRow>
          <DataTableCell columnKey="month">Sep 2026</DataTableCell>
          <DataTableCell columnKey="gross">5,500.00</DataTableCell>
          <DataTableCell columnKey="bonus">—</DataTableCell>
          <DataTableCell columnKey="tax">1,465.00</DataTableCell>
          <DataTableCell columnKey="net">3,760.00</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: ['max-md:col-span-4', '>Net pay</span>', '>Gross</span>'],
    excludes: ['sr-only', 'Show details'],
  },
  {
    name: 'DataTable applies column cell metadata',
    element: (
      <DataTable
        density="compact"
        tableVariant="financial"
        columns={[
          {
            key: 'amount',
            header: 'Amount',
            align: 'right',
            mobileLabel: 'Amount',
            numeric: true,
            cellClassName: 'font-semibold',
          },
        ]}
      >
        <DataTableRow>
          <DataTableCell columnKey="amount">EUR 42.00</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: ['font-numeric', 'font-semibold', 'md:h-7', 'text-right', 'Amount', 'EUR 42.00'],
  },
  {
    name: 'DataTable can render mobile expansion rows without card padding',
    element: (
      <DataTable columns={[{ key: 'asset', header: 'Asset' }]}>
        <DataTableRow mobileCard={false}>
          <DataTableCell colSpan={1} className="p-0">
            Expanded panel
          </DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: ['colSpan="1"', 'p-0', 'Expanded panel'],
    excludes: ['max-md:rounded-lg'],
  },
  {
    name: 'DataTable renders toolbar and filter slots',
    element: (
      <DataTable
        title="Goals"
        toolbar={<Button size="sm">Add goal</Button>}
        filters={<TextInput value="travel" onChange={noop} aria-label="Filter goals" />}
        columns={[{ key: 'goal', header: 'Goal' }]}
      >
        <DataTableRow>
          <DataTableCell>Travel fund</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: ['Add goal', 'aria-label="Filter goals"', 'value="travel"', 'Travel fund'],
  },
  {
    name: 'DataTable renders empty state',
    element: (
      <DataTable
        title="Budgets"
        columns={[{ key: 'budget', header: 'Budget' }]}
        isEmpty
        emptyState="No budgets yet."
      />
    ),
    includes: ['colSpan="1"', 'No budgets yet.'],
  },
  {
    name: 'DataTable renders loading state',
    element: (
      <DataTable
        title="Rates"
        columns={[{ key: 'currency', header: 'Currency' }]}
        isLoading
        loadingState="Loading rates"
      />
    ),
    includes: ['role="status"', 'Loading rates'],
  },
  {
    name: 'DataTable renders footer slot',
    element: (
      <DataTable
        title="Debts"
        columns={[{ key: 'debt', header: 'Debt' }]}
        footer={
          <Pagination
            page={1}
            totalPages={2}
            rangeStart={1}
            rangeEnd={10}
            totalCount={20}
            onChange={noop}
          />
        }
      >
        <DataTableRow>
          <DataTableCell>Student loan</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: ['Student loan', 'aria-label="Next page"'],
  },
  {
    name: 'DateNoteRow renders shared date and note fields',
    element: (
      <DateNoteRow
        date="2026-03-10"
        note="Monthly deposit"
        notePlaceholder="e.g. Monthly..."
        onDateChange={noop}
        onNoteChange={noop}
      />
    ),
    includes: ['Date', 'Note', 'value="2026-03-10"', 'value="Monthly deposit"'],
  },
  {
    name: 'TxnTypeSelector renders transaction options',
    element: (
      <TxnTypeSelector
        value="deposit"
        onChange={noop}
        types={[
          {
            key: 'deposit',
            label: 'Deposit',
            icon: PiggyBank,
            color: 'text-success',
            bg: 'bg-success-soft',
            borderColor: 'border-success',
          },
          {
            key: 'transfer',
            label: 'Transfer',
            icon: ArrowDownUp,
            color: 'text-brand',
            bg: 'bg-brand-soft',
            borderColor: 'border-brand',
          },
        ]}
      />
    ),
    includes: [
      'Deposit',
      'Transfer',
      'type="button"',
      'aria-pressed="true"',
      'aria-pressed="false"',
      'flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 text-label',
      'max-sm:h-11 max-sm:flex-col',
      'border-brand bg-brand-soft font-semibold text-brand-fg',
      'border-border-control bg-surface text-fg-muted',
      'text-success',
    ],
    excludes: ['border-2', 'text-[10px]', 'bg-success-soft', 'border-success'],
  },
  {
    name: 'Modal renders shared headerProps shell',
    element: (
      <Modal
        title="Welcome back"
        subtitle="Sign in to continue"
        onClose={noop}
        scrollable
        headerProps={{
          align: 'center',
          visual: <div data-smoke="modal-visual">Logo</div>,
          titleClassName: 'tracking-tight',
          closeButtonClassName: 'rounded-full',
        }}
        footer={<Button>Submit</Button>}
      >
        <div>Modal body</div>
      </Modal>
    ),
    includes: [
      'Welcome back',
      'Sign in to continue',
      'data-smoke="modal-visual"',
      'Modal body',
      'Submit',
      'max-w-md',
      'aria-label="Close dialog"',
      'aria-labelledby=',
    ],
  },
  {
    name: 'Modal sits on the scrim and becomes a bottom sheet on phones',
    element: (
      <Modal
        title="Edit account"
        onClose={noop}
        footer={<ModalFooter onCancel={noop} onConfirm={noop} />}
      >
        <div>Body</div>
      </Modal>
    ),
    includes: [
      'bg-scrim',
      'starting:opacity-0',
      'duration-base',
      'shadow-overlay',
      'rounded-lg border border-border-default bg-surface',
      'max-sm:items-end',
      'max-sm:rounded-t-xl',
      'motion-safe:max-sm:starting:translate-y-full',
      'motion-safe:max-sm:data-closing:translate-y-full',
      'min-h-11',
      'text-title-section',
      'p-4 space-y-4 text-body',
      'bg-surface-sunken',
      'max-sm:flex-wrap',
      'max-sm:*:h-11',
      'Cancel',
      'Save',
    ],
    excludes: ['backdrop-blur', 'bg-gradient', 'scale-', 'from-surface-inverse'],
  },
  {
    name: 'Modal that is closing is inert and plays the closing transition',
    element: (
      <Modal title="Edit account" onClose={noop} open={false}>
        <div>Body</div>
      </Modal>
    ),
    includes: ['inert=""', 'data-closing=""', 'overflow-clip'],
  },
  {
    name: 'Modal that is open is not inert',
    element: (
      <Modal title="Edit account" onClose={noop}>
        <div>Body</div>
      </Modal>
    ),
    includes: ['aria-modal="true"'],
    excludes: ['inert=""', 'data-closing=""'],
  },
  {
    name: 'underline SegmentedControl links tabs to their panels with one tab in the Tab order',
    element: (
      <SegmentedControl
        variant="underline"
        tabsId="demo"
        value="b"
        onChange={noop}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />
    ),
    includes: [
      'id="demo-tab-a"',
      'aria-controls="demo-panel-a"',
      'id="demo-tab-b"',
      'aria-controls="demo-panel-b"',
      'tabindex="-1"',
    ],
  },
  {
    name: 'DataTable offers details for columns the cards leave out and a phone sort control',
    element: (
      <DataTable
        sort={{ columnKey: 'account', direction: 'asc' }}
        onSortChange={noop}
        columns={[
          { key: 'account', header: 'Account', sortable: true },
          { key: 'note', header: 'Note', priority: 'secondary', sortable: true },
        ]}
      >
        <DataTableRow>
          <DataTableCell columnKey="account">Checking</DataTableCell>
          <DataTableCell columnKey="note">Joint</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: [
      'max-md:group-data-details-open:flex',
      'aria-expanded="false"',
      'Show details',
      '>Sort by</label>',
      'Sorted ascending, sort descending',
    ],
  },
  {
    name: 'ArchiveOrDeleteDialog orders cancel, archive and a filled delete',
    element: (
      <CurrencyContext.Provider value={smokeCurrency}>
        <ArchiveOrDeleteDialog
          entityLabel="Savings account"
          entityName="Holiday fund"
          childrenLabel="transactions"
          onArchive={noop}
          onDelete={noop}
          onCancel={noop}
        />
      </CurrencyContext.Provider>
    ),
    includes: ['Archive savings account', 'Delete savings account', 'bg-danger text-fg-inverted'],
  },
  {
    name: 'DataTable rows are 28px on desktop and 48px lines on phones with a plain header',
    element: (
      <DataTable
        title="Payments"
        columns={[
          { key: 'date', header: 'Date' },
          { key: 'amount', header: 'Amount', numeric: true },
        ]}
      >
        <DataTableRow interactive selected onClick={noop}>
          <DataTableCell columnKey="date">01 Oct 2026</DataTableCell>
          <DataTableCell columnKey="amount">1,250.00</DataTableCell>
        </DataTableRow>
        <DataTableRow data-total>
          <DataTableCell columnKey="date">Total</DataTableCell>
          <DataTableCell columnKey="amount">1,250.00</DataTableCell>
        </DataTableRow>
      </DataTable>
    ),
    includes: [
      'h-7 px-3 text-label text-fg-muted',
      'border-b border-border-default',
      'md:h-7',
      'max-sm:min-h-12',
      'text-cell',
      'md:hover:bg-surface-muted',
      'bg-brand-soft',
      'text-right font-numeric',
      'data-total:border-t data-total:border-border-strong data-total:font-semibold',
      'data-total="true"',
    ],
    excludes: ['uppercase', 'tracking-', 'bg-surface-sunken'],
  },
  {
    name: 'StatCard reads a zero change as 0.00 with no sign in the flat colour',
    element: (
      <StatCard
        label="Savings"
        value="EUR 10.00"
        change={{ value: '+EUR 0.00 this month', positive: true }}
      />
    ),
    includes: ['text-flat', '>EUR 0.00 this month<'],
    excludes: ['text-gain', '+EUR'],
  },
  {
    name: 'StatCard shows a loss with a true minus sign',
    element: (
      <StatCard
        label="Savings"
        value="EUR 10.00"
        change={{ value: '-EUR 12.50 MTD', positive: false }}
        subtitle="2 accounts"
      />
    ),
    includes: ['text-loss', '>\u2212EUR 12.50 MTD<', 'text-caption text-fg-subtle', '2 accounts'],
  },
  {
    name: 'StatCard renders a numeric change through Change with a caption',
    element: (
      <StatCard
        label="Savings"
        value="EUR 10.00"
        change={{ amount: -12.5, format: 'amount', label: 'this month' }}
      />
    ),
    includes: ['text-loss', '<span class="sr-only">down </span>', '\u221212.50', '>this month<'],
    excludes: ['text-gain'],
  },
  {
    name: 'StatCard reads a numeric zero change as 0.00 with no sign',
    element: (
      <StatCard
        label="Savings"
        value="EUR 10.00"
        change={{ amount: 0, format: 'amount', label: 'this month' }}
      />
    ),
    includes: ['text-flat', '>0.00<'],
    excludes: ['text-gain', 'text-loss', '+0.00', '\u22120.00', '\u25B2', '\u25BC'],
  },
  {
    name: 'ChartCard has a card header above padded content',
    element: (
      <ChartCard title="Net worth" hasData>
        <div>Chart</div>
      </ChartCard>
    ),
    includes: ['min-h-9', 'border-b border-border-default', 'text-title-section', 'p-4', 'Chart'],
    excludes: ['shadow-', 'mb-5'],
  },
  {
    name: 'ChartCard passes header and action classes so a header control can wrap on phones',
    element: (
      <ChartCard
        title="Net worth"
        badge={<span>Range</span>}
        headerClassName="max-sm:flex-wrap"
        headerActionClassName="max-sm:w-full"
        hasData
      >
        <div>Chart</div>
      </ChartCard>
    ),
    includes: ['max-sm:px-4 max-sm:flex-wrap', 'gap-2 max-sm:w-full"><span>Range</span>'],
  },
  {
    name: 'TxnHistoryPanel filter fills the width on phones and rows are one line on desktop',
    element: (
      <TxnHistoryPanel
        filterOptions={[
          { key: 'all', label: 'All' },
          { key: 'deposit', label: 'Deposits' },
        ]}
        filter="all"
        onFilterChange={noop}
        onAdd={noop}
        stats={[{ label: 'In', value: 'EUR 10.00' }]}
        isEmpty={false}
      >
        <TxnRow
          icon={Plus}
          iconColor="text-gain"
          iconBg="bg-gain-soft"
          label="Deposit"
          date="2026-10-01"
          amount={<span className="text-gain">+EUR 10.00</span>}
          onDelete={noop}
        />
      </TxnHistoryPanel>
    ),
    includes: [
      'aria-label="Filter transactions"',
      'max-sm:w-full',
      'min-h-7',
      'max-sm:min-h-12',
      '01 Oct 2026',
      'text-right font-numeric',
      'text-figure-md',
      'max-sm:opacity-100',
    ],
    excludes: ['bg-gain-soft', 'Filter:', 'text-[10px]'],
  },
  {
    name: 'TxnHistoryPanel stripes rows only when asked and keeps hover and selection above the stripe',
    element: (
      <TxnHistoryPanel
        filterOptions={[{ key: 'all', label: 'All' }]}
        filter="all"
        onFilterChange={noop}
        striped
        isEmpty={false}
      >
        <TxnRow
          icon={Plus}
          iconColor="text-gain"
          label="Deposit"
          date="2026-10-01"
          amount="+EUR 10.00"
          onDelete={noop}
        />
      </TxnHistoryPanel>
    ),
    includes: [
      'divide-border-default',
      ':nth-child(even)',
      'bg-surface-sunken',
      'hover:bg-surface-muted',
    ],
    excludes: ['divide-border-subtle'],
  },
  {
    name: 'PageStack renders shared page spacing classes',
    element: (
      <PageStack data-smoke="page-stack">
        <div>Overview</div>
        <div>Details</div>
      </PageStack>
    ),
    includes: [
      'data-smoke="page-stack"',
      'p-4 sm:p-6 space-y-4 sm:space-y-6',
      'Overview',
      'Details',
    ],
  },
  {
    name: 'ContentSection renders section spacing classes',
    element: (
      <ContentSection data-smoke="content-section" spacing="lg">
        <div>Performance</div>
      </ContentSection>
    ),
    includes: ['data-smoke="content-section"', 'space-y-4 sm:space-y-6', 'Performance'],
    excludes: ['<h2'],
  },
  {
    name: 'ContentSection renders a titled section with the section title style',
    element: (
      <ContentSection data-smoke="titled-section" title="Performance" contentClassName="grid gap-4">
        <div>Chart</div>
      </ContentSection>
    ),
    includes: [
      'data-smoke="titled-section"',
      'flex flex-col gap-3',
      'aria-labelledby=',
      'text-title-section',
      '>Performance</h2>',
      'grid gap-4',
      'Chart',
    ],
  },
];

function renderMarkup(element: ReactElement) {
  return renderToStaticMarkup(element);
}

for (const smokeCase of smokeCases) {
  test(smokeCase.name, () => {
    const markup = renderMarkup(smokeCase.element);

    for (const fragment of smokeCase.includes) {
      expect(markup).toContain(fragment);
    }
    for (const fragment of smokeCase.excludes ?? []) {
      expect(markup).not.toContain(fragment);
    }
  });
}

describe('nextTabIndex', () => {
  const enabled = [false, false, false];

  test('arrows move by one and wrap around the ends', () => {
    expect(nextTabIndex('ArrowRight', 0, enabled)).toBe(1);
    expect(nextTabIndex('ArrowRight', 2, enabled)).toBe(0);
    expect(nextTabIndex('ArrowLeft', 0, enabled)).toBe(2);
    expect(nextTabIndex('ArrowDown', 1, enabled)).toBe(2);
    expect(nextTabIndex('ArrowUp', 1, enabled)).toBe(0);
  });

  test('Home and End go to the ends and disabled tabs are skipped', () => {
    expect(nextTabIndex('Home', 2, enabled)).toBe(0);
    expect(nextTabIndex('End', 0, enabled)).toBe(2);
    expect(nextTabIndex('ArrowRight', 0, [false, true, false])).toBe(2);
    expect(nextTabIndex('Home', 2, [true, false, false])).toBe(1);
  });

  test('other keys and a control with nothing enabled report no target', () => {
    expect(nextTabIndex('Enter', 0, enabled)).toBeNull();
    expect(nextTabIndex('ArrowRight', 0, [true, true])).toBeNull();
  });
});
