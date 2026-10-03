import { useSavedState } from './settingsForm';
/* eslint-disable max-lines-per-function */
import { useState } from 'react';

import { Check, Link2, RefreshCw, Unlink } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import { buildApiUrl, resolveApiErrorMessage } from '@/lib/api';
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
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-mono text-slate-400 shrink-0">
        {mapping.source.toUpperCase()} {mapping.sourceKey}
      </span>
      <input
        className="flex-1 text-sm text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-400 focus:outline-none px-1 py-0.5 text-right transition-colors"
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
      <h4 className="text-sm font-semibold text-slate-900 mb-1">Bank category rules</h4>
      <p className="text-xs text-slate-500 mb-3">
        These rules map your bank's categories to Quro's budget categories. Changes apply to future
        syncs only.
      </p>
      <div className="rounded-xl border border-slate-200 px-4 py-1">
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
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Connected accounts</h3>
        <p className="mt-1 text-sm text-slate-500">
          Link external bank accounts to sync your financial data automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <img src="/bunq-icon.png" alt="bunq" className="h-10 w-10 rounded-lg" />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">Bunq</p>
                {connection ? <Badge tone="success">Connected</Badge> : null}
              </div>
              {connection ? (
                <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                  <p>Last synced: {formatSyncTime(connection.lastSyncAt)}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Connect your Bunq account to automatically sync savings and budget transactions.
                </p>
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
                  className={cn(saved && 'bg-emerald-500 hover:bg-emerald-500')}
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
