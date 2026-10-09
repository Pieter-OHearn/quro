import {
  FEATURES,
  RETIRED_SETTINGS,
  SETTINGS,
  type SettingAudience,
  type SettingGroup,
  type SettingName,
  type SettingRequirement,
} from './settings';

export type ManifestEntry = {
  name: SettingName;
  group: SettingGroup;
  type: string;
  audience: SettingAudience;
  description: string;
  /** `file`: the value is the path of a file holding the secret. `value`: the value is secret. */
  secret: 'file' | 'value' | null;
  /** Default as an operator would write it, or null when there is none. */
  default: string | null;
  /** `yes`: always. `feature`: once the feature in `requiredWhen` is configured. `no`: optional. */
  required: 'yes' | 'feature' | 'no';
  requiredWhen: string | null;
  example: string | null;
};

function requirementLevel(requirement: SettingRequirement): ManifestEntry['required'] {
  if (requirement.kind === 'never') return 'no';
  return requirement.kind === 'feature' ? 'feature' : 'yes';
}

function requirementCondition(requirement: SettingRequirement): string | null {
  switch (requirement.kind) {
    case 'feature':
      return `${FEATURES[requirement.feature].label} is configured`;
    case 'unlessUrl':
      return requirement.note;
    case 'always':
      return requirement.note ?? null;
    default:
      return null;
  }
}

/**
 * Every setting the backend reads, generated from the same table the loader parses with. The
 * installer uses it to decide what to write and what to ask for; the configuration reference is
 * generated from it, so a new setting appears everywhere by being added in one place.
 */
export function settingsManifest(): ManifestEntry[] {
  return (Object.keys(SETTINGS) as SettingName[]).map((name) => {
    const definition = SETTINGS[name];
    const { requirement } = definition;
    const defaultValue = definition.default;
    return {
      name,
      group: definition.group,
      type: definition.type,
      audience: definition.audience,
      description: definition.description,
      secret: definition.secret ?? null,
      default:
        definition.defaultLabel ?? (defaultValue === undefined ? null : String(defaultValue)),
      required: requirementLevel(requirement),
      requiredWhen: requirementCondition(requirement),
      example: definition.example ?? null,
    };
  });
}

/** Optional features that stay off until one of their settings appears, and then need all of them. */
export function featureManifest() {
  return Object.entries(FEATURES).map(([id, feature]) => ({
    id,
    label: feature.label,
    enabledBy: [...feature.enabledBy],
    requires: [...feature.requires],
  }));
}

/** Settings earlier releases read and this one ignores, with what replaces each. */
export function retiredManifest() {
  return Object.entries(RETIRED_SETTINGS).map(([name, replacement]) => ({ name, replacement }));
}
