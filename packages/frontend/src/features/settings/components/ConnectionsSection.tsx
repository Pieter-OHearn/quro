import { useSavedState } from './settingsForm';
/* eslint-disable max-lines-per-function */
import { useState } from 'react';

import { Check, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { buildApiUrl, resolveApiErrorMessage } from '@/lib/api';
import { useBunqAvailability } from '@/lib/useAppCapabilities';
import { cn } from '@/lib/utils';
import {
  useBunqConnection,
  useCategoryMappings,
  useDisconnectBunq,
  useSyncBunq,
  useUpdateCategoryMapping,
  type CategoryMapping,
} from '../hooks';

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
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border-subtle last:border-0">
      <span className="text-xs text-fg-faint shrink-0">
        {mapping.source.toUpperCase()} {mapping.sourceKey}
      </span>
      <input
        className="flex-1 text-sm text-fg-emphasis bg-transparent border-b border-transparent hover:border-border-default focus:border-brand-disabled focus:outline-none px-1 py-0.5 text-right transition-colors"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label={`Category name for ${mapping.sourceKey}`}
      />
    </div>
  );
}

function CategoryMappingsSection() {
  const { data: mappings = [], isLoading } = useCategoryMappings();

  if (isLoading) return null;
  if (mappings.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-fg mb-1">Bank category rules</h4>
      <p className="text-xs text-fg-subtle mb-3">
        These rules map your bank's categories to Quro's budget categories. Changes apply to future
        syncs only.
      </p>
      <div className="rounded-xl border border-border-default px-4 py-1">
        {mappings.map((mapping) => (
          <MappingRow key={mapping.id} mapping={mapping} />
        ))}
      </div>
    </div>
  );
}

export function ConnectionsSection() {
  const { data: connection, isLoading } = useBunqConnection();
  const disconnect = useDisconnectBunq();
  const sync = useSyncBunq();
  const [error, setError] = useState<string | null>(null);
  const { saved, showSaved } = useSavedState();

  const handleDisconnect = async () => {
    setError(null);
    try {
      await disconnect.mutateAsync();
      showSaved();
    } catch (e: unknown) {
      setError(resolveApiErrorMessage(e, 'Failed to disconnect Bunq'));
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
    return (
      <div className="flex items-center justify-center py-12 text-sm text-fg-faint">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-fg">Connected accounts</h3>
        <p className="mt-1 text-sm text-fg-subtle">
          Link external bank accounts to sync your financial data automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-danger-soft-strong bg-danger-soft px-4 py-3 text-sm text-danger-hover">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-border-default p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <img src="/bunq-icon.png" alt="bunq" className="h-10 w-10 rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-fg">Bunq</p>
                {connection ? <Badge tone="success">Connected</Badge> : null}
              </div>
              {connection ? (
                <div className="mt-1 space-y-0.5 text-xs text-fg-subtle">
                  <p>Last synced: {formatSyncTime(connection.lastSyncAt)}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-fg-subtle">{disconnectedMessage}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
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
                  loading={disconnect.isPending}
                  className={cn(saved && 'bg-success-accent hover:bg-success-accent')}
                  onClick={() => {
                    void handleDisconnect();
                  }}
                >
                  {saved ? 'Disconnected' : 'Disconnect'}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                size="sm"
                leadingIcon={<Link2 size={14} />}
                disabled={bunqUnavailable}
                onClick={handleConnect}
              >
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>

      <CategoryMappingsSection />
    </div>
  );
}
