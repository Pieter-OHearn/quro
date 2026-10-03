import type { PensionImportStatus } from '@quro/shared';

export type JobPhase = 'queuing' | 'processing' | 'ready';
export const PENSION_IMPORT_STATUS: Record<
  PensionImportStatus,
  { phase: JobPhase; notification: JobPhase | 'failed' }
> = {
  queued: { phase: 'queuing', notification: 'queuing' },
  processing: { phase: 'processing', notification: 'processing' },
  ready_for_review: { phase: 'ready', notification: 'ready' },
  committed: { phase: 'ready', notification: 'failed' },
  failed: { phase: 'queuing', notification: 'failed' },
  expired: { phase: 'queuing', notification: 'failed' },
  cancelled: { phase: 'queuing', notification: 'failed' },
};
