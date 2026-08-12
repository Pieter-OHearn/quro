import type { JurisdictionCode, JurisdictionProfile } from '@quro/shared';
import { auJurisdiction } from './au';
import { genericJurisdiction } from './generic';
import { nlJurisdiction } from './nl';

const JURISDICTIONS: Record<JurisdictionCode, JurisdictionProfile> = {
  GENERIC: genericJurisdiction,
  NL: nlJurisdiction,
  AU: auJurisdiction,
};

export function getJurisdictionProfile(code: JurisdictionCode): JurisdictionProfile {
  return JURISDICTIONS[code];
}

export { auJurisdiction, genericJurisdiction, nlJurisdiction };
