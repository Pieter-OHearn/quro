import type { AppCapabilityLifecycle, AppCapabilityReason } from '@quro/shared';
import { getConfig, type Config } from '../config';
import { BUNQ_UNAVAILABLE_MESSAGE } from './bunqConfig';

// The registry is the single source of truth for optional features. Each entry answers one
// question from configuration alone: is this feature switched on? The application wires routes
// and schedulers to those answers (src/app.ts), `GET /api/capabilities` reports them (merged with
// runtime state such as the import worker's heartbeat), and `quro doctor` reads the same list.
// Each entry also says how far it is supported: `stable`, or `experimental` for a feature that may
// change or go away in a minor release. Settings shows both to the user.

export type CapabilityId = 'bunq' | 's3Storage' | 'pensionImport';

export type ConfiguredState = {
  enabled: boolean;
  reason: Extract<AppCapabilityReason, 'not_configured'> | null;
  message: string;
};

export type CapabilityDefinition = {
  id: CapabilityId;
  label: string;
  lifecycle: AppCapabilityLifecycle;
  evaluate: (config: Config) => ConfiguredState;
};

const ENABLED = { enabled: true, reason: null } as const;

function disabled(message: string): ConfiguredState {
  return { enabled: false, reason: 'not_configured', message };
}

export const PENSION_IMPORT_UNCONFIGURED_MESSAGE =
  'Statement import is not set up on this Quro server.';

export const CAPABILITIES: readonly CapabilityDefinition[] = [
  {
    id: 'bunq',
    label: 'bunq linking',
    lifecycle: 'stable',
    evaluate: ({ bunq }) =>
      bunq.enabled
        ? { ...ENABLED, message: 'Bunq linking is available.' }
        : disabled(BUNQ_UNAVAILABLE_MESSAGE),
  },
  {
    // Documents are always stored; this says whether an S3-compatible store holds them instead
    // of the documents directory (QRO_DOCUMENT_STORAGE).
    id: 's3Storage',
    label: 'S3 document storage',
    lifecycle: 'stable',
    evaluate: ({ documents }) =>
      documents.driver === 's3'
        ? { ...ENABLED, message: 'Documents are stored in an S3-compatible store.' }
        : disabled('Documents are stored in the documents directory.'),
  },
  {
    // Statement OCR runs a parser and a local model behind an opt-in Compose profile; it is
    // experimental and never part of the default install.
    id: 'pensionImport',
    label: 'Statement import',
    lifecycle: 'experimental',
    evaluate: ({ pensionImport }) =>
      pensionImport.parserUrl !== null
        ? { ...ENABLED, message: 'Statement import is configured.' }
        : disabled(PENSION_IMPORT_UNCONFIGURED_MESSAGE),
  },
];

export function getCapabilityDefinition(id: CapabilityId): CapabilityDefinition {
  const capability = CAPABILITIES.find((entry) => entry.id === id);
  if (!capability) throw new Error(`Unknown capability: ${id}`);
  return capability;
}

export function evaluateCapability(
  id: CapabilityId,
  config: Config = getConfig(),
): ConfiguredState {
  return getCapabilityDefinition(id).evaluate(config);
}

export function enabledCapabilities(config: Config = getConfig()): ReadonlySet<CapabilityId> {
  return new Set(
    CAPABILITIES.filter((capability) => capability.evaluate(config).enabled).map(
      (capability) => capability.id,
    ),
  );
}

/** Every capability with its configured state, for diagnostics such as `quro doctor`. */
export function describeCapabilities(config: Config = getConfig()) {
  return CAPABILITIES.map(({ id, label, lifecycle, evaluate }) => ({
    id,
    label,
    lifecycle,
    ...evaluate(config),
  }));
}
