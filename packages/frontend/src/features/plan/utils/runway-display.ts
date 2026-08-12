import type { RunwayBand } from '@quro/shared';

export const RUNWAY_BAND_META: Record<
  RunwayBand,
  { label: string; description: string; badgeTone: 'warning' | 'info' | 'success' }
> = {
  critical: {
    label: 'Critical',
    description: 'Less than one month of modelled runway',
    badgeTone: 'warning',
  },
  building: {
    label: 'Building',
    description: 'Between one and six months of modelled runway',
    badgeTone: 'info',
  },
  resilient: {
    label: 'Resilient',
    description: 'Six months or more of modelled runway',
    badgeTone: 'success',
  },
};

export const RUNWAY_CITATIONS = {
  band: 'Financial Health Network treats six or more months as resilient.',
  tiers: 'Liquidity is modelled from cash first, then less-certain assets with explicit haircuts.',
  tax: 'Benefit and severance figures use effective payslip tax where available.',
  advice: 'These figures are planning estimates, not personalised financial or investment advice.',
} as const;

export function formatMonths(value: number | null): string {
  if (value === null) return 'Covered indefinitely';
  if (!Number.isFinite(value)) return 'Unavailable';
  return `${value.toFixed(1)} months`;
}
