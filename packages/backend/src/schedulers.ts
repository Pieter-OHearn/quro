import { getConfig, type Config } from './config';
import { enabledCapabilities, type CapabilityId } from './lib/capabilityRegistry';
import { startBunqSyncScheduler } from './lib/bunqSyncScheduler';
import { startCurrencyRateSyncScheduler } from './lib/currencyRateSyncScheduler';
import { startHoldingPriceSyncScheduler } from './lib/holdingPriceSyncScheduler';
import { startNetWorthSnapshotScheduler } from './lib/netWorthSnapshotScheduler';
import { startSessionCleanup } from './lib/sessionCleanup';

export type SchedulerEntry = {
  name: string;
  /** The scheduler runs only while this capability is enabled; core schedulers have none. */
  capability?: CapabilityId;
  start: () => void;
};

export const SCHEDULERS: readonly SchedulerEntry[] = [
  { name: 'session-cleanup', start: startSessionCleanup },
  { name: 'bunq-sync', capability: 'bunq', start: startBunqSyncScheduler },
  { name: 'holding-price-sync', start: startHoldingPriceSyncScheduler },
  { name: 'currency-rate-sync', start: startCurrencyRateSyncScheduler },
  { name: 'net-worth-snapshot', start: startNetWorthSnapshotScheduler },
];

/** The schedulers this configuration runs: the core ones plus those of enabled capabilities. */
export function activeSchedulers(
  config: Config = getConfig(),
  entries: readonly SchedulerEntry[] = SCHEDULERS,
): SchedulerEntry[] {
  const enabled = enabledCapabilities(config);
  return entries.filter((entry) => !entry.capability || enabled.has(entry.capability));
}

export function startSchedulers(
  config: Config = getConfig(),
  entries: readonly SchedulerEntry[] = SCHEDULERS,
): void {
  if (config.runtime.environment === 'test') return;
  if (config.runtime.schedulersDisabled) {
    console.log('[schedulers] QRO_DISABLE_SCHEDULERS is set; background jobs are off');
    return;
  }
  for (const scheduler of activeSchedulers(config, entries)) scheduler.start();
}
