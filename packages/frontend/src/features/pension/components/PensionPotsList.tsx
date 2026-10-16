import { displayLabel } from '@/lib/displayLabels';
import { useState } from 'react';
import { ChevronDown, ChevronUp, Edit3, Info, Lock, Plus, Trash2 } from 'lucide-react';
import type { AppCapabilityStatus, PensionPot, PensionTransaction } from '@quro/shared';
import {
  ArchiveOrDeleteDialog,
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableRow,
  IconButton,
  RowActions,
  type DataTableColumn,
} from '@/components/ui';
import { stopRowClick } from '@/components/finance/stopRowClick';
import type {
  ConvertToBaseFn,
  DeletePotMutation,
  IsForeignFn,
  PensionFormatBaseFn,
  PensionFormatNativeFn,
} from '../types';
import { computeCurrentPensionBalance } from '../utils/pension-calculations';
import { PensionTxnHistory } from './PensionTxnHistory';

type PensionPotsListProps = {
  pensions: PensionPot[];
  pensionTxns: PensionTransaction[];
  expanded: number | null;
  setExpanded: (value: number | null) => void;
  setEditing: (value: PensionPot | undefined) => void;
  setShowModal: (value: boolean) => void;
  setAddTxnForPot: (value: PensionPot | null) => void;
  openImportModal: (pot: PensionPot, importId?: number | null) => void;
  setEditingTxn: (value: PensionTransaction | null) => void;
  deletePot: DeletePotMutation;
  handleDeletePensionTxn: (id: number) => void;
  totalInBase: number;
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  baseCurrency: string;
  pensionImportCapability: AppCapabilityStatus;
};

type PensionPotRowProps = {
  pot: PensionPot;
  isOpen: boolean;
  pensionTxns: PensionTransaction[];
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  convertToBase: ConvertToBaseFn;
  isForeign: IsForeignFn;
  baseCurrency: string;
  onEdit: (pot: PensionPot) => void;
  onToggle: (id: number | null) => void;
  onDelete: (id: number) => void;
  onAddTxn: (pot: PensionPot) => void;
  onImportStatement: (pot: PensionPot) => void;
  onEditTxn: (transaction: PensionTransaction) => void;
  onDeleteTxn: (id: number) => void;
  pensionImportCapability: AppCapabilityStatus;
};

type PensionPotDetailsProps = {
  pot: PensionPot;
  currentBalance: number;
  foreign: boolean;
  balanceInBase: number;
  baseCurrency: string;
  fmtBase: PensionFormatBaseFn;
  fmtNative: PensionFormatNativeFn;
  onDelete: (id: number) => void;
  onImportStatement: (pot: PensionPot) => void;
  pensionImportCapability: AppCapabilityStatus;
};

function buildPotColumns(baseCurrency: string): readonly DataTableColumn[] {
  return [
    { key: 'pot', header: 'Pot', width: '30%' },
    { key: 'provider', header: 'Provider', priority: 'secondary', width: '26%' },
    {
      key: 'contributions',
      header: 'Contributions / year',
      numeric: true,
      priority: 'secondary',
      width: '15%',
    },
    { key: 'balance', header: 'Balance', numeric: true, width: '14%' },
    { key: 'value', header: `Value (${baseCurrency})`, numeric: true, width: '15%' },
    { key: 'actions', header: '', priority: 'actions', width: 72 },
  ];
}

const POT_COLUMN_COUNT = 6;

function PensionPotNotes({ pot }: Readonly<{ pot: PensionPot }>) {
  const metadataEntries = Object.entries(pot.metadata ?? {});
  return (
    <>
      {pot.notes && (
        <p className="flex items-start gap-1.5 text-caption text-fg-subtle">
          <Info size={12} className="mt-0.5 shrink-0 text-fg-faint" aria-hidden />
          {pot.notes}
        </p>
      )}
      {metadataEntries.length > 0 && (
        <div>
          <p className="mb-1 text-label text-fg-muted">Metadata</p>
          <div className="flex flex-wrap gap-1.5">
            {metadataEntries.map(([key, value]) => (
              <Badge key={key} size="md">
                <strong className="font-medium text-fg">{key}:</strong> {value || '—'}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PensionPotDetails({
  pot,
  currentBalance,
  foreign,
  balanceInBase,
  baseCurrency,
  fmtBase,
  fmtNative,
  onDelete,
  onImportStatement,
  pensionImportCapability,
}: Readonly<PensionPotDetailsProps>) {
  const detailStats = [
    { label: 'Balance (native)', value: fmtNative(currentBalance, pot.currency) },
    { label: `Balance (${baseCurrency})`, value: fmtBase(balanceInBase) },
    { label: 'Your contribution', value: `${fmtNative(pot.employeeMonthly, pot.currency)}/mo` },
    {
      label: 'Employer contributions',
      value: `${fmtNative(pot.employerMonthly, pot.currency)}/mo`,
    },
    {
      label: 'Strategy',
      value: pot.investmentStrategy ?? '—',
    },
  ];

  return (
    <div className="space-y-3 border-t border-border-default px-3 py-3 max-sm:px-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {detailStats.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <dt className="text-label text-fg-muted">{label}</dt>
            <dd className="truncate text-figure-md text-fg">{value}</dd>
          </div>
        ))}
      </dl>
      {foreign && (
        <p className="flex items-start gap-2 rounded-md border border-info bg-info-soft px-3 py-2 text-caption text-info">
          <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            This pot is held in <strong>{pot.currency}</strong>. The {baseCurrency} equivalent uses
            the synced FX rates currently loaded in Quro.
          </span>
        </p>
      )}
      <PensionPotNotes pot={pot} />
      <div className="flex flex-wrap gap-2">
        <PensionImportButton
          pot={pot}
          capability={pensionImportCapability}
          onImportStatement={onImportStatement}
        />
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDelete(pot.id)}
          leadingIcon={<Trash2 size={12} aria-hidden />}
        >
          Remove pot
        </Button>
      </div>
    </div>
  );
}

type PensionImportButtonProps = {
  pot: PensionPot;
  capability: AppCapabilityStatus;
  onImportStatement: (pot: PensionPot) => void;
};

function DisabledPensionImportButton({
  capability,
}: Readonly<Pick<PensionImportButtonProps, 'capability'>>) {
  const [showHint, setShowHint] = useState(false);

  return (
    <div className="relative inline-flex max-w-full">
      {showHint && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-20 mb-1 w-80 max-w-[calc(100vw-2rem)] rounded-md bg-surface-inverse px-2 py-1 text-caption text-fg-on-inverse shadow-popover"
        >
          {capability.message}
        </div>
      )}
      <Button
        variant="secondary"
        size="sm"
        aria-disabled="true"
        onClick={(event) => {
          event.preventDefault();
          setShowHint((current) => !current);
        }}
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        onFocus={() => setShowHint(true)}
        onBlur={() => setShowHint(false)}
        leadingIcon={<Lock size={12} className="shrink-0 text-fg-faint" aria-hidden />}
        trailingIcon={<Badge size="xs">Unavailable</Badge>}
        className="max-w-full text-fg-subtle"
      >
        <span className="truncate">Import annual statement PDF</span>
      </Button>
    </div>
  );
}

function PensionImportButton({
  pot,
  capability,
  onImportStatement,
}: Readonly<PensionImportButtonProps>) {
  // A server that never set statement import up has no import to offer; a set-up one that is
  // down shows why.
  if (capability.reason === 'not_configured') return null;
  if (!capability.enabled) {
    return <DisabledPensionImportButton capability={capability} />;
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      trailingIcon={<Badge size="xs">Experimental</Badge>}
      onClick={() => onImportStatement(pot)}
    >
      Import annual statement PDF
    </Button>
  );
}

function PensionPotActions({
  isOpen,
  onEdit,
  onToggle,
}: Readonly<{ isOpen: boolean; onEdit: () => void; onToggle: () => void }>) {
  const toggleLabel = isOpen ? 'Collapse' : 'View transactions';
  return (
    <RowActions>
      <IconButton
        onClick={stopRowClick(onEdit)}
        icon={Edit3}
        label="Edit pot"
        title="Edit pot"
        size="sm"
        variant="subtle"
      />
      <IconButton
        onClick={stopRowClick(onToggle)}
        icon={isOpen ? ChevronUp : ChevronDown}
        label={toggleLabel}
        title={toggleLabel}
        aria-expanded={isOpen}
        size="sm"
        variant="subtle"
      />
    </RowActions>
  );
}

type PensionPotExpandedRowProps = PensionPotDetailsProps &
  Pick<PensionPotRowProps, 'pensionTxns' | 'onAddTxn' | 'onEditTxn' | 'onDeleteTxn'>;

function PensionPotExpandedRow({
  pensionTxns,
  onAddTxn,
  onEditTxn,
  onDeleteTxn,
  ...details
}: Readonly<PensionPotExpandedRowProps>) {
  return (
    <DataTableRow mobileCard={false} className="md:hover:bg-transparent">
      <DataTableCell
        colSpan={POT_COLUMN_COUNT}
        className="p-0 max-md:block max-md:py-0"
        contentClassName="w-full"
      >
        <PensionPotDetails {...details} />
        <PensionTxnHistory
          pot={details.pot}
          transactions={pensionTxns}
          onAdd={() => onAddTxn(details.pot)}
          onEdit={onEditTxn}
          onDelete={onDeleteTxn}
        />
      </DataTableCell>
    </DataTableRow>
  );
}

function PensionPotRow({
  pot,
  isOpen,
  pensionTxns,
  fmtBase,
  fmtNative,
  convertToBase,
  isForeign,
  baseCurrency,
  onEdit,
  onToggle,
  onDelete,
  onAddTxn,
  onImportStatement,
  onEditTxn,
  onDeleteTxn,
  pensionImportCapability,
}: Readonly<PensionPotRowProps>) {
  const potTxns = pensionTxns.filter((txn) => txn.potId === pot.id);
  const currentBalance = computeCurrentPensionBalance(pot, potTxns);
  const totalMonthly = pot.employeeMonthly + pot.employerMonthly;
  const balanceInBase = convertToBase(currentBalance, pot.currency);
  const foreign = isForeign(pot.currency);
  const toggle = () => onToggle(isOpen ? null : pot.id);

  return (
    <>
      <DataTableRow interactive selected={isOpen} onClick={toggle}>
        <DataTableCell columnKey="pot">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 leading-none" aria-hidden>
              {pot.emoji}
            </span>
            <span className="min-w-0 truncate font-medium text-fg">{pot.name}</span>
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
              <Badge>{displayLabel(pot.type)}</Badge>
              {foreign && <Badge>{pot.currency}</Badge>}
            </span>
          </div>
        </DataTableCell>
        <DataTableCell columnKey="provider" contentClassName="truncate text-fg-muted">
          {pot.provider} · {fmtNative(totalMonthly, pot.currency)}/mo · {potTxns.length}{' '}
          transactions
        </DataTableCell>
        <DataTableCell columnKey="contributions">
          +{fmtNative(totalMonthly * 12, pot.currency)}/yr
        </DataTableCell>
        <DataTableCell columnKey="balance" className="font-medium text-fg">
          {fmtNative(currentBalance, pot.currency)}
        </DataTableCell>
        <DataTableCell columnKey="value">{fmtBase(balanceInBase)}</DataTableCell>
        <DataTableCell columnKey="actions" contentClassName="md:ml-auto">
          <PensionPotActions isOpen={isOpen} onEdit={() => onEdit(pot)} onToggle={toggle} />
        </DataTableCell>
      </DataTableRow>
      {isOpen && (
        <PensionPotExpandedRow
          pot={pot}
          pensionTxns={pensionTxns}
          currentBalance={currentBalance}
          foreign={foreign}
          balanceInBase={balanceInBase}
          baseCurrency={baseCurrency}
          fmtBase={fmtBase}
          fmtNative={fmtNative}
          onDelete={onDelete}
          onAddTxn={onAddTxn}
          onImportStatement={onImportStatement}
          onEditTxn={onEditTxn}
          onDeleteTxn={onDeleteTxn}
          pensionImportCapability={pensionImportCapability}
        />
      )}
    </>
  );
}

function PensionPotDeleteDialog({
  pot,
  pensionTxns,
  deletePot,
  onClose,
}: Readonly<{
  pot: PensionPot;
  pensionTxns: PensionTransaction[];
  deletePot: DeletePotMutation;
  onClose: () => void;
}>) {
  const balance = computeCurrentPensionBalance(
    pot,
    pensionTxns.filter((txn) => txn.potId === pot.id),
  );
  return (
    <ArchiveOrDeleteDialog
      entityLabel="Pension pot"
      entityName={pot.name}
      balance={balance}
      balanceCurrency={pot.currency}
      childrenLabel="contributions and history"
      onArchive={() => {
        deletePot.mutate({ id: pot.id, mode: 'preserveTransactions' });
        onClose();
      }}
      onDelete={() => {
        deletePot.mutate({ id: pot.id, mode: 'deleteTransactions' });
        onClose();
      }}
      onCancel={onClose}
    />
  );
}

function PensionTotalRow({
  totalInBase,
  fmtBase,
}: Readonly<{ totalInBase: number; fmtBase: PensionFormatBaseFn }>) {
  return (
    <DataTableRow data-total>
      <DataTableCell columnKey="pot">Total</DataTableCell>
      <DataTableCell columnKey="provider" />
      <DataTableCell columnKey="contributions" />
      <DataTableCell columnKey="balance" className="max-md:hidden" />
      <DataTableCell columnKey="value">{fmtBase(totalInBase)}</DataTableCell>
      <DataTableCell columnKey="actions" className="max-md:hidden" />
    </DataTableRow>
  );
}

function PensionPotRows({
  onRequestDelete,
  ...props
}: Readonly<PensionPotsListProps & { onRequestDelete: (pot: PensionPot) => void }>) {
  const { pensions, setEditingTxn, setAddTxnForPot } = props;
  return pensions.map((pot) => (
    <PensionPotRow
      key={pot.id}
      pot={pot}
      isOpen={props.expanded === pot.id}
      pensionTxns={props.pensionTxns}
      fmtBase={props.fmtBase}
      fmtNative={props.fmtNative}
      convertToBase={props.convertToBase}
      isForeign={props.isForeign}
      baseCurrency={props.baseCurrency}
      onEdit={(item) => props.setEditing(item)}
      onToggle={props.setExpanded}
      onDelete={() => onRequestDelete(pot)}
      onAddTxn={(item) => {
        setEditingTxn(null);
        setAddTxnForPot(item);
      }}
      onImportStatement={(item) => props.openImportModal(item)}
      onEditTxn={(transaction) => {
        setAddTxnForPot(null);
        setEditingTxn(transaction);
      }}
      onDeleteTxn={props.handleDeletePensionTxn}
      pensionImportCapability={props.pensionImportCapability}
    />
  ));
}

export function PensionPotsList(props: Readonly<PensionPotsListProps>) {
  const { pensions, pensionTxns, setEditing, setShowModal, totalInBase, fmtBase } = props;
  const [potPendingDelete, setPotPendingDelete] = useState<PensionPot | null>(null);

  return (
    <>
      <DataTable
        title="Pension pots"
        subtitle="Click a pot to view transactions"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setShowModal(true);
            }}
            leadingIcon={<Plus size={12} aria-hidden />}
          >
            Add pot
          </Button>
        }
        columns={buildPotColumns(props.baseCurrency)}
        tableLayout="fixed"
        minWidth={880}
        isEmpty={pensions.length === 0}
        emptyState="No pension pots yet. Click Add pot to start tracking."
      >
        <PensionPotRows {...props} onRequestDelete={setPotPendingDelete} />
        {pensions.length > 0 && <PensionTotalRow totalInBase={totalInBase} fmtBase={fmtBase} />}
      </DataTable>
      {potPendingDelete ? (
        <PensionPotDeleteDialog
          pot={potPendingDelete}
          pensionTxns={pensionTxns}
          deletePot={props.deletePot}
          onClose={() => setPotPendingDelete(null)}
        />
      ) : null}
    </>
  );
}
