import type { BrandAnatomyItem } from '../types';
import { BrandAnatomy } from './BrandAnatomy';
import { BrandHeroIntro } from './BrandHeroIntro';

type BrandHeroProps = {
  readonly anatomyItems: readonly BrandAnatomyItem[];
  readonly heroTags: readonly string[];
};

export function BrandHero({ anatomyItems, heroTags }: Readonly<BrandHeroProps>) {
  return (
    <div className="bg-gradient-to-br from-[#0a0f1e] via-[#111830] to-[#1b2550] px-8 pt-16 pb-20 text-white">
      <div className="max-w-4xl mx-auto">
        <p className="text-[10px] tracking-[0.3em] uppercase text-indigo-400 mb-6">
          Brand Identity
        </p>
        <BrandHeroIntro heroTags={heroTags} />
        <BrandAnatomy anatomyItems={anatomyItems} />
      </div>
    </div>
  );
}
