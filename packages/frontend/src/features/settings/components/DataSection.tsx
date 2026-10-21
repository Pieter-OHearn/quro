import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import type { AccountDeletionPreview, User } from '@quro/shared';
import { Button, FormField, LoadingState, Modal, PasswordInput, TextInput } from '@/components/ui';
import { resolveApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import {
  useAccountDeletionPreview,
  useDeleteAccount,
  useExportData,
  useSingleSignOnLink,
} from '../hooks';
import { FormErrorNotice, SettingsCard } from './settingsForm';

const DELETE_FAILED_MESSAGE = 'The account could not be deleted. Try again.';

function ExportCard() {
  const exportData = useExportData();
  return (
    <SettingsCard
      title="Export your data"
      subtitle="One ZIP with your accounts, transactions, plans and documents as JSON and CSV."
      footer={
        <Button
          variant="secondary"
          leadingIcon={<Download size={16} aria-hidden="true" />}
          loading={exportData.isPending}
          loadingLabel="Preparing export"
          onClick={() => exportData.mutate()}
        >
          Download export
        </Button>
      }
    >
      <p className="text-cell text-fg-muted">
        Joint accounts you own are included in full. Your partner&apos;s own accounts, your
        password, sign-in sessions and bank-link credentials are not. A README in the archive
        explains every file.
      </p>
      {exportData.error ? <FormErrorNotice>{exportData.error.message}</FormErrorNotice> : null}
    </SettingsCard>
  );
}

function countRows(preview: AccountDeletionPreview): number {
  return Object.values(preview.rowCounts).reduce((sum, count) => sum + count, 0);
}

export function DeletionSummary({ preview }: Readonly<{ preview: AccountDeletionPreview }>) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-cell text-fg-muted">
      <li>
        {countRows(preview)} records and {preview.documentCount} stored documents are deleted for
        good.
      </li>
      {preview.hasPartner ? (
        <li>
          {preview.sharedWithPartner > 0
            ? `${preview.sharedWithPartner} joint accounts, properties and mortgages you own disappear for your partner too. `
            : ''}
          Your partner&apos;s own records stay. Entries you made on their joint accounts stay with
          them.
        </li>
      ) : null}
      <li>Backups made before today still hold your data until they are deleted or expire.</li>
    </ul>
  );
}

type DeleteAccountDialogProps = {
  user: User;
  /** False when the operator turned passwords off: a recent provider sign-in is asked instead. */
  passwordLogin?: boolean;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteAccountDialog({
  user,
  passwordLogin = true,
  onClose,
  onDeleted,
}: Readonly<DeleteAccountDialogProps>) {
  const preview = useAccountDeletionPreview(true);
  const deleteAccount = useDeleteAccount(onDeleted);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const emailMatches = confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const canDelete = emailMatches && (!passwordLogin || password !== '') && !deleteAccount.isPending;

  return (
    <Modal
      title="Delete your account"
      subtitle="This cannot be undone. Export your data first if you want a copy."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="dangerSolid"
            disabled={!canDelete}
            loading={deleteAccount.isPending}
            onClick={() =>
              deleteAccount.mutate(passwordLogin ? { password, confirmEmail } : { confirmEmail })
            }
          >
            Delete account
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {preview.isPending ? (
          <LoadingState compact className="min-h-0 py-4" label="Checking what will be deleted" />
        ) : null}
        {preview.data ? <DeletionSummary preview={preview.data} /> : null}
        <FormField label={`Type ${user.email} to confirm`} required>
          <TextInput
            type="email"
            autoComplete="off"
            value={confirmEmail}
            onChange={setConfirmEmail}
          />
        </FormField>
        {passwordLogin ? (
          <FormField label="Password" required>
            <PasswordInput
              value={password}
              show={showPassword}
              onChange={setPassword}
              onToggle={() => setShowPassword((current) => !current)}
            />
          </FormField>
        ) : (
          <p className="text-cell text-fg-muted" data-testid="delete-fresh-sign-in">
            Passwords are turned off on this Quro instance. To delete your account you must have
            signed in through single sign-on in the last 10 minutes. If you did not, sign out and
            sign in again first.
          </p>
        )}
        {deleteAccount.error ? (
          <FormErrorNotice>
            {resolveApiErrorMessage(deleteAccount.error, DELETE_FAILED_MESSAGE)}
          </FormErrorNotice>
        ) : null}
      </div>
    </Modal>
  );
}

function DeleteCard({ user }: Readonly<{ user: User }>) {
  const { replaceUser } = useAuth();
  const [open, setOpen] = useState(false);
  const link = useSingleSignOnLink();
  return (
    <SettingsCard
      title="Delete your account"
      subtitle="Remove your account and everything it owns from this Quro instance."
      footer={
        <Button
          variant="danger"
          leadingIcon={<Trash2 size={16} aria-hidden="true" />}
          onClick={() => setOpen(true)}
        >
          Delete account
        </Button>
      }
    >
      <p className="text-cell text-fg-muted">
        Deleting is immediate and permanent on this instance. Backups of the instance keep older
        copies until the operator deletes them.
      </p>
      {open ? (
        <DeleteAccountDialog
          user={user}
          passwordLogin={link.data?.passwordLogin !== false}
          onClose={() => setOpen(false)}
          onDeleted={() => replaceUser(null)}
        />
      ) : null}
    </SettingsCard>
  );
}

export function DataSection({ user }: Readonly<{ user: User }>) {
  return (
    <div className="space-y-4">
      <ExportCard />
      <DeleteCard user={user} />
    </div>
  );
}
