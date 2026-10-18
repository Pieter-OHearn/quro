import type { AssetClassKey, MixGroup } from '@quro/shared';
import { ASSET_CLASS_GROUP } from '@quro/shared';

/**
 * Chart colours for the groups of the reference mixes. They are the fixed chart tokens: stocks are
 * investments (`viz-2`), bonds savings (`viz-1`), cash the neutral grey, and everything else the
 * amber and plum of the other asset series. Unclassified is a muted fill with a dashed edge, so it
 * never reads as a group of its own.
 */
export const GROUP_BAR_CLASS: Record<MixGroup | 'unclassified', string> = {
  stocks: 'bg-viz-2',
  bonds: 'bg-viz-1',
  cash: 'bg-viz-6',
  other: 'bg-viz-3',
  unclassified: 'bg-surface-muted border border-dashed border-border-control',
};

export function assetClassBarClass(key: AssetClassKey): string {
  return key === 'unclassified'
    ? GROUP_BAR_CLASS.unclassified
    : GROUP_BAR_CLASS[ASSET_CLASS_GROUP[key]];
}

/** Shares at or under this are drawn as a sliver the eye can still find. */
export const MIN_VISIBLE_SHARE = 0.6;
