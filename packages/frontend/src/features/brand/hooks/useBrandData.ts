import type { BrandData } from '../types';
import {
  anatomyItems,
  contextVariants,
  donts,
  heroTags,
  palette,
  sizes,
} from '../utils/brand-data';

const brandData: BrandData = {
  palette,
  sizes,
  donts,
  anatomyItems,
  contextVariants,
  heroTags,
};

export function useBrandData(): BrandData {
  return brandData;
}
