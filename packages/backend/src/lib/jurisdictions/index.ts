import type { JurisdictionCode, JurisdictionProfile } from '@quro/shared';
import { genericJurisdiction } from './generic';
import { nlJurisdiction } from './nl';

const JURISDICTIONS: Record<JurisdictionCode, JurisdictionProfile> = {
  GENERIC: genericJurisdiction,
  NL: nlJurisdiction,
  // AU intentionally falls back conservatively until its dedicated profile ships.
  AU: { ...genericJurisdiction, code: 'AU' },
};

export function getJurisdictionProfile(code: JurisdictionCode): JurisdictionProfile {
  return JURISDICTIONS[code];
}

export { genericJurisdiction, nlJurisdiction };
