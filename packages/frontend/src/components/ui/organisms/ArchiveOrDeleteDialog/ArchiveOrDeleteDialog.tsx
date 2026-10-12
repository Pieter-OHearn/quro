import { useCurrency } from '@/lib/currencyContextValue';
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

function buildSubtitle(
  hasNonZeroBalance: boolean,
  hideArchive: boolean,
  args: {
    entityLabel: string;
    balanceLabel: string;
    formattedBalance: string;
    childrenLabel: string;
  },
): string {
  if (hideArchive) {
    return `This will permanently remove "${args.entityLabel.toLowerCase()}" and all its ${
      args.childrenLabel
    }. Your wealth history for past months will be recomputed without it.`;
  }
  if (hasNonZeroBalance) {
    return `This ${args.entityLabel.toLowerCase()} still has a ${args.balanceLabel} of ${args.formattedBalance}. Archiving will create a step in your wealth chart on today's date — delete permanently if you no longer own it.`;
  }
  return `Archive keeps ${args.childrenLabel} so your wealth history stays continuous. Delete permanently removes everything.`;
}

// Cancel, then "Archive …", then "Delete …": the only filled destructive button in the app is
// this confirm step.
const DELETE_BUTTON_CLASS_NAME =
  'border-danger bg-danger text-fg-inverted hover:bg-danger active:bg-danger enabled:hover:opacity-90 enabled:active:opacity-90';

function DialogFooter({
  entityLabel,
  hideArchive,
  nameMatches,
  isPending,
  onCancel,
  onArchive,
  onDelete,
}: Readonly<{
  entityLabel: string;
  hideArchive: boolean;
  nameMatches: boolean;
  isPending: boolean | undefined;
  onCancel: () => void;
  onArchive?: () => void;
  onDelete: () => void;
}>) {
  const object = entityLabel.toLowerCase();
  return (
    <>
      <Button onClick={onCancel} variant="ghost">
        Cancel
      </Button>
      {!hideArchive && onArchive ? (
        <Button onClick={onArchive} disabled={!nameMatches || isPending} variant="secondary">
          Archive {object}
        </Button>
      ) : null}
      <Button
        onClick={onDelete}
        disabled={!nameMatches || isPending}
        variant="danger"
        className={DELETE_BUTTON_CLASS_NAME}
      >
        Delete {object}
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
  const { fmtNative } = useCurrency();
  const [confirmName, setConfirmName] = useState('');
  const nameMatches = confirmName.trim() === entityName.trim();
  const hasNonZeroBalance = balance != null && Math.abs(balance) >= NEAR_ZERO_THRESHOLD;
  const subtitle = buildSubtitle(hasNonZeroBalance, hideArchive, {
    entityLabel,
    balanceLabel,
    formattedBalance: fmtNative(balance ?? 0, balanceCurrency ?? 'EUR', true),
    childrenLabel,
  });

  return (
    <Modal
      title={hideArchive ? `Delete ${entityLabel}` : `Remove ${entityLabel}`}
      subtitle={subtitle}
      onClose={onCancel}
      footer={
        <DialogFooter
          entityLabel={entityLabel}
          hideArchive={hideArchive}
          nameMatches={nameMatches}
          isPending={isPending}
          onCancel={onCancel}
          onArchive={onArchive}
          onDelete={onDelete}
        />
      }
    >
      {hasNonZeroBalance && !hideArchive ? (
        <div className="flex gap-2 rounded-md border border-warning bg-warning-soft p-3 text-cell text-warning">
          <AlertTriangle size={16} className="mt-px shrink-0" aria-hidden />
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
