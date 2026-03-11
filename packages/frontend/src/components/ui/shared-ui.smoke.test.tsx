/// <reference types="bun-types" />

import { expect, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertTriangle, ArrowDownUp, PiggyBank, Plus } from 'lucide-react';
import { Badge } from './atoms/Badge';
import { Button } from './atoms/Button';
import { Card } from './atoms/Card';
import { CurrencyInput } from './atoms/CurrencyInput';
import { DateInput } from './atoms/DateInput';
import { LoadingSpinner } from './atoms/LoadingSpinner';
import { PasswordInput } from './atoms/PasswordInput';
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
import { TxnTypeSelector } from './molecules/TxnTypeSelector';
import { Modal } from './organisms/Modal';
import { ContentSection, PageStack } from './templates';

type SmokeCase = {
  name: string;
  element: ReactElement;
  includes: readonly string[];
};

const noop = () => {};

const smokeCases: readonly SmokeCase[] = [
  {
    name: 'Badge renders shared badge copy',
    element: (
      <Badge data-smoke="badge" tone="warning">
        Pending
      </Badge>
    ),
    includes: ['data-smoke="badge"', 'Pending'],
  },
  {
    name: 'Button renders loading state markup',
    element: (
      <Button loading loadingLabel="Saving item" variant="primary">
        Save
      </Button>
    ),
    includes: ['aria-busy="true"', 'Saving item'],
  },
  {
    name: 'Card renders wrapper and children',
    element: (
      <Card data-smoke="card" padding="none">
        Card body
      </Card>
    ),
    includes: ['data-smoke="card"', 'Card body'],
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
    ],
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
    includes: ['>EUR</span>', 'type="number"', 'value="1250.50"'],
  },
  {
    name: 'DateInput renders date field markup',
    element: <DateInput value="2026-03-10" onChange={noop} />,
    includes: ['type="date"', 'value="2026-03-10"'],
  },
  {
    name: 'Textarea renders rows and content',
    element: <Textarea rows={4} placeholder="Add note" value="Shared note" onChange={noop} />,
    includes: ['rows="4"', 'placeholder="Add note"', 'Shared note'],
  },
  {
    name: 'PasswordInput renders toggle button and masked input',
    element: <PasswordInput value="password123" show={false} onChange={noop} onToggle={noop} />,
    includes: ['type="password"', 'value="password123"', 'aria-label="Show password"'],
  },
  {
    name: 'FormField renders label, hint, and error copy',
    element: (
      <FormField label="Amount" required hint="optional" error="Required field">
        <TextInput value="" onChange={noop} />
      </FormField>
    ),
    includes: ['Amount', 'optional', 'Required field'],
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
    includes: ['Recent transactions', 'Updated just now', 'Add transaction'],
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
    includes: ['No mortgages yet', 'Add your first mortgage to get started.', 'Add mortgage'],
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
    includes: ['role="tablist"', 'aria-selected="true"', '>2025<', '>2026<'],
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
    ],
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
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            borderColor: 'border-emerald-200',
          },
          {
            key: 'transfer',
            label: 'Transfer',
            icon: ArrowDownUp,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            borderColor: 'border-indigo-200',
          },
        ]}
      />
    ),
    includes: ['Deposit', 'Transfer'],
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
    ],
  },
  {
    name: 'PageStack renders shared page spacing classes',
    element: (
      <PageStack data-smoke="page-stack">
        <div>Overview</div>
        <div>Details</div>
      </PageStack>
    ),
    includes: ['data-smoke="page-stack"', 'p-6 space-y-6', 'Overview', 'Details'],
  },
  {
    name: 'ContentSection renders section spacing classes',
    element: (
      <ContentSection data-smoke="content-section" spacing="lg">
        <div>Performance</div>
      </ContentSection>
    ),
    includes: ['data-smoke="content-section"', 'space-y-6', 'Performance'],
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
  });
}
