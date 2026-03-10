import { QuroLogo } from '@/components/ui';
import type { BrandLogoSize } from '../types';
import { SectionHeader } from './SectionHeader';

type MarkSizesSectionProps = {
  readonly sizes: readonly BrandLogoSize[];
};

export function MarkSizesSection({ sizes }: Readonly<MarkSizesSectionProps>) {
  return (
    <section>
      <SectionHeader
        title="The Mark"
        sub="Renders cleanly from 22 px favicon to full app-icon scale"
      />
      <div className="flex items-end gap-6 flex-wrap mt-6">
        {sizes.map(({ label, px }) => (
          <div key={px} className="flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-[#0d1627] p-4 flex items-center justify-center shadow-lg shadow-black/20">
              <QuroLogo size={px} showBg={false} />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-700">{px}px</p>
              <p className="text-[10px] text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
