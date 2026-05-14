import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../Modal';
import { Button } from '../../atoms/Button';
import { TextInput } from '../../atoms/TextInput';
import { FormField } from '../../molecules/FormField';

export type ArchiveOrDeleteAction = 'archive' | 'delete';

export type ArchiveOrDeleteDialogProps = {
  entityLabel: string;
  entityName: string;
  /**
   * The "balance" still associated with the entity in its own currency.
   * Used to warn the user that archiving a non-zero entity will create a
   * phantom step in the wealth chart.
   */
  balance?: number | null;
  balanceCurrency?: string;
  /**
   * Label used in the warning copy to describe the balance, e.g. "balance",
   * "outstanding balance", "current value".
   */
  balanceLabel?: string;
  /**
   * Human-readable hint describing the transactions/payments preserved by
   * archive and removed by delete.
   */
  childrenLabel: string;
  /**
   * If true, the archive option is hidden and the dialog only confirms a
   * permanent delete. Use for already-archived items where archive is moot.
   */
  hideArchive?: boolean;
  onArchive?: () => void;
  onDelete: () => void;
  onCancel: () => void;
  isPending?: boolean;
};

const NEAR_ZERO_THRESHOLD = 0.005;

function formatBalance(value: number, currency: string | undefined): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function buildSubtitle(
  hasNonZeroBalance: boolean,
  hideArchive: boolean,
  args: {
    entityLabel: string;
    balanceLabel: string;
    balanceCurrency?: string;
    balance: number;
    childrenLabel: string;
  },
): string {
  if (hideArchive) {
    return `This will permanently remove "${args.entityLabel.toLowerCase()}" and all its ${
      args.childrenLabel
    }. Your wealth history for past months will be recomputed without it.`;
  }
  if (hasNonZeroBalance) {
    return `This ${args.entityLabel.toLowerCase()} still has a ${args.balanceLabel} of ${formatBalance(
      args.balance,
      args.balanceCurrency,
    )}. Archiving will create a step in your wealth chart on today's date — delete permanently if you no longer own it.`;
  }
  return `Archive keeps ${args.childrenLabel} so your wealth history stays continuous. Delete permanently removes everything.`;
}

function DialogFooter({
  hideArchive,
  nameMatches,
  isPending,
  hasNonZeroBalance,
  onCancel,
  onArchive,
  onDelete,
}: Readonly<{
  hideArchive: boolean;
  nameMatches: boolean;
  isPending: boolean | undefined;
  hasNonZeroBalance: boolean;
  onCancel: () => void;
  onArchive?: () => void;
  onDelete: () => void;
}>) {
  return (
    <>
      <Button onClick={onCancel} variant="secondary" size="lg" className="flex-1">
        Cancel
      </Button>
      {!hideArchive && onArchive ? (
        <Button
          onClick={onArchive}
          disabled={!nameMatches || isPending}
          variant={hasNonZeroBalance ? 'secondary' : 'primary'}
          size="lg"
          className="flex-1"
        >
          Archive
        </Button>
      ) : null}
      <Button
        onClick={onDelete}
        disabled={!nameMatches || isPending}
        variant="danger"
        size="lg"
        className="flex-1"
      >
        Delete
      </Button>
    </>
  );
}

export function ArchiveOrDeleteDialog({
  entityLabel,
  entityName,
  balance,
  balanceCurrency,
  balanceLabel = 'balance',
  childrenLabel,
  hideArchive = false,
  onArchive,
  onDelete,
  onCancel,
  isPending,
}: Readonly<ArchiveOrDeleteDialogProps>) {
  const [confirmName, setConfirmName] = useState('');
  const nameMatches = confirmName.trim() === entityName.trim();
  const hasNonZeroBalance = balance != null && Math.abs(balance) >= NEAR_ZERO_THRESHOLD;
  const subtitle = buildSubtitle(hasNonZeroBalance, hideArchive, {
    entityLabel,
    balanceLabel,
    balanceCurrency,
    balance: balance ?? 0,
    childrenLabel,
  });

  return (
    <Modal
      title={hideArchive ? `Delete ${entityLabel}` : `Remove ${entityLabel}`}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <DialogFooter
          hideArchive={hideArchive}
          nameMatches={nameMatches}
          isPending={isPending}
          hasNonZeroBalance={hasNonZeroBalance}
          onCancel={onCancel}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      }
    >
      {hasNonZeroBalance && !hideArchive ? (
        <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            <span className="font-medium">Recommended:</span> delete permanently. Archiving with a
            non-zero {balanceLabel} will make your wealth chart show a sudden step today.
          </p>
        </div>
      ) : null}
      <FormField label={`Type "${entityName}" to confirm`}>
        <TextInput
          value={confirmName}
          onChange={setConfirmName}
          placeholder={entityName}
          autoFocus
        />
      </FormField>
    </Modal>
  );
}
