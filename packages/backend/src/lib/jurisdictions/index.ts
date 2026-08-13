import type { JurisdictionCode, PlanningJurisdictionProfile } from '@quro/shared';
import { auJurisdiction } from './au';
import { genericJurisdiction } from './generic';
import { nlJurisdiction } from './nl';

const JURISDICTIONS: Record<JurisdictionCode, PlanningJurisdictionProfile> = {
  GENERIC: genericJurisdiction,
  NL: nlJurisdiction,
  AU: auJurisdiction,
};

export function getJurisdictionProfile(code: JurisdictionCode): PlanningJurisdictionProfile {
  return JURISDICTIONS[code];
}

export { auJurisdiction, genericJurisdiction, nlJurisdiction };
