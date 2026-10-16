import { FormErrorNotice, SettingsCard, useSavedState } from './settingsForm';
/* eslint-disable max-lines-per-function */
import { useState } from 'react';
import type { AppCapabilities, AppCapabilityStatus } from '@quro/shared';

import { Check, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Badge, Button, LoadingState, Modal, TextInput } from '@/components/ui';
import { buildApiUrl, resolveApiErrorMessage } from '@/lib/api';
import { useAppCapabilities, useBunqAvailability } from '@/lib/useAppCapabilities';
import { cn } from '@/lib/utils';
import {
  useBunqConnection,
  useCategoryMappings,
  useDisconnectBunq,
  useSyncBunq,
  useUpdateCategoryMapping,
  type CategoryMapping,
} from '../hooks';

const ROADMAP_URL = 'https://github.com/Pieter-OHearn/quro/blob/main/ROADMAP.md';

type FeatureRow = {
  key: 'bunq' | 'pensionStatementImport' | 'documents';
  name: string;
  /** What the feature is, when it is on. */
  summary: string;
};

const FEATURE_ROWS: readonly FeatureRow[] = [
  { key: 'documents', name: 'Document storage', summary: 'Payslips and statements you attach.' },
  { key: 'bunq', name: 'Bunq linking', summary: 'Sync savings accounts and transactions.' },
  {
    key: 'pensionStatementImport',
    name: 'Statement import',
    summary: 'Read pension statement PDFs with a local model.',
  },
];

function featureState(status: AppCapabilityStatus): { label: string; tone: 'success' | 'muted' } {
  return status.enabled ? { label: 'On', tone: 'success' } : { label: 'Off', tone: 'muted' };
}

// What this server offers, as the server reports it. Optional features are switched on by the
// operator, so an "Off" row says why instead of offering a button that cannot work.
export function FeaturesList({ capabilities }: Readonly<{ capabilities: AppCapabilities }>) {
  return (
    <SettingsCard
      title="Features on this server"
      subtitle="Optional features are switched on by whoever runs this server."
      flush
      footer={
        <a
          href={ROADMAP_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm text-cell font-medium text-brand hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus-ring"
        >
          See the roadmap
        </a>
      }
    >
      <ul className="divide-y divide-border-subtle">
        {FEATURE_ROWS.map(({ key, name, summary }) => {
          const status = capabilities[key];
          const state = featureState(status);
          return (
            <li key={key} className="flex items-start justify-between gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-cell font-medium text-fg">
                  {name}
                  {status.lifecycle === 'experimental' ? (
                    <Badge tone="warning" size="xs">
                      Experimental
                    </Badge>
                  ) : null}
                </p>
                <p className="text-caption text-fg-subtle">
                  {status.enabled ? summary : status.message}
                </p>
              </div>
              <Badge tone={state.tone}>{state.label}</Badge>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

function FeaturesCard() {
  const { data: capabilities } = useAppCapabilities();
  return capabilities ? <FeaturesList capabilities={capabilities} /> : null;
}

function formatSyncTime(value: string | null): string {
  if (!value) return 'Never synced';
  const date = new Date(value);
  if (isNaN(date.getTime())) return 'Never synced';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function MappingRow({ mapping }: Readonly<{ mapping: CategoryMapping }>) {
  const update = useUpdateCategoryMapping();
  const [value, setValue] = useState(mapping.categoryName);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== mapping.categoryName) {
      update.mutate({ id: mapping.id, categoryName: trimmed });
    } else {
      setValue(mapping.categoryName);
    }
  };

  return (
    <li className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
      <span className="min-w-0 shrink truncate text-cell text-fg-muted">
        {mapping.source.toUpperCase()} {mapping.sourceKey}
      </span>
      <TextInput
        className="max-w-56 text-right"
        value={value}
        onChange={setValue}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label={`Category name for ${mapping.sourceKey}`}
      />
    </li>
  );
}

function CategoryMappingsSection() {
  const { data: mappings = [], isLoading } = useCategoryMappings();

  if (isLoading) return null;
  if (mappings.length === 0) return null;

  return (
    <SettingsCard
      title="Bank category rules"
      subtitle="These rules map your bank's categories to Quro's budget categories. Changes apply to future syncs only."
      flush
    >
      <ul className="divide-y divide-border-subtle">
        {mappings.map((mapping) => (
          <MappingRow key={mapping.id} mapping={mapping} />
        ))}
      </ul>
    </SettingsCard>
  );
}

type DisconnectBunqDialogProps = {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

// Disconnecting ends the bank link, so it asks first; the confirm button is the filled danger step.
export function DisconnectBunqDialog({
  isPending,
  onCancel,
  onConfirm,
}: Readonly<DisconnectBunqDialogProps>) {
  return (
    <Modal
      title="Disconnect Bunq?"
      onClose={onCancel}
      maxWidth="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="dangerSolid" loading={isPending} onClick={onConfirm}>
            Disconnect Bunq
          </Button>
        </>
      }
    >
      <p className="text-body text-fg-muted">
        Quro stops syncing your Bunq accounts. Accounts and transactions it already imported stay.
        To sync again, connect Bunq again.
      </p>
    </Modal>
  );
}

// A server without bunq set up has nothing to connect, so it offers no button; the card says why.
function ConnectBunqButton({
  unavailable,
  onConnect,
}: Readonly<{ unavailable: boolean; onConnect: () => void }>) {
  if (unavailable) return null;
  return (
    <Button variant="primary" size="sm" leadingIcon={<Link2 size={14} />} onClick={onConnect}>
      Connect
    </Button>
  );
}

export function ConnectionsSection() {
  const { data: connection, isLoading } = useBunqConnection();
  const disconnect = useDisconnectBunq();
  const sync = useSyncBunq();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const { saved, showSaved } = useSavedState();

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnect.mutateAsync();
      showSaved();
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, 'Failed to disconnect Bunq'));
    } finally {
      setConfirmingDisconnect(false);
    }
  };

  const { unavailable: bunqUnavailable, disconnectedMessage } = useBunqAvailability();

  const handleConnect = () => {
    window.location.href = buildApiUrl('/api/bunq/oauth/start');
  };

  const handleSync = async () => {
    setError(null);
    try {
      await sync.mutateAsync();
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, 'Failed to sync Bunq'));
    }
  };

  if (isLoading) {
    return <LoadingState compact className="min-h-0 py-12" label="Loading connections" />;
  }

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Connected accounts"
        subtitle="Link external bank accounts to sync your financial data automatically."
      >
        {error ? <FormErrorNotice>{error}</FormErrorNotice> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <img src="/bunq-icon.png" alt="bunq" className="h-8 w-8 shrink-0 rounded-md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-body font-medium text-fg">Bunq</p>
                {connection ? <Badge tone="success">Connected</Badge> : null}
              </div>
              {connection ? (
                <p className="text-caption text-fg-subtle">
                  Last synced: {formatSyncTime(connection.lastSyncAt)}
                </p>
              ) : (
                <p className="text-caption text-fg-subtle">{disconnectedMessage}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 max-sm:*:flex-1">
            {connection ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={
                    <RefreshCw size={14} className={cn(sync.isPending && 'animate-spin')} />
                  }
                  loading={sync.isPending}
                  onClick={() => {
                    void handleSync();
                  }}
                >
                  Sync
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  leadingIcon={saved ? <Check size={14} /> : <Unlink size={14} />}
                  onClick={() => setConfirmingDisconnect(true)}
                >
                  {saved ? 'Disconnected' : 'Disconnect'}
                </Button>
              </>
            ) : (
              <ConnectBunqButton unavailable={bunqUnavailable} onConnect={handleConnect} />
            )}
          </div>
        </div>
      </SettingsCard>

      <CategoryMappingsSection />

      <FeaturesCard />

      {confirmingDisconnect ? (
        <DisconnectBunqDialog
          isPending={disconnect.isPending}
          onCancel={() => setConfirmingDisconnect(false)}
          onConfirm={() => {
            void handleDisconnect();
          }}
        />
      ) : null}
    </div>
  );
}
