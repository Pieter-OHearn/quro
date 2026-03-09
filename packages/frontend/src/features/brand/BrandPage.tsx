import {
  BrandHero,
  ClearspaceSection,
  ColourSystemSection,
  ContextSection,
  MarkSizesSection,
  UsageGuidelinesSection,
  WordmarkSection,
} from './components';
import { useBrandData } from './hooks';

export function Brand() {
  const { anatomyItems, contextVariants, donts, heroTags, palette, sizes } = useBrandData();

  return (
    <div className="min-h-screen bg-slate-50">
      <BrandHero anatomyItems={anatomyItems} heroTags={heroTags} />
      <div className="max-w-4xl mx-auto px-8 py-12 space-y-14">
        <MarkSizesSection sizes={sizes} />
        <WordmarkSection />
        <ContextSection contextVariants={contextVariants} />
        <ColourSystemSection palette={palette} />
        <ClearspaceSection />
        <UsageGuidelinesSection donts={donts} />
      </div>
    </div>
  );
}
