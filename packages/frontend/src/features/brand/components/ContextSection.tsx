import { QuroLogo } from '@/components/ui/QuroLogo';
import type { BrandContextVariant } from '../types';
import { SectionHeader } from './SectionHeader';

type ContextSectionProps = {
  readonly contextVariants: readonly BrandContextVariant[];
};

export function ContextSection({ contextVariants }: Readonly<ContextSectionProps>) {
  return (
    <section>
      <SectionHeader title="Context" sub="The mark adapts across dark and light surfaces" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        {contextVariants.map(({ bg, label, showBg, inverted }) => (
          <div
            key={label}
            className={`rounded-2xl ${bg} p-6 flex flex-col items-center gap-3 shadow-sm`}
          >
            <QuroLogo size={56} showBg={showBg} inverted={inverted} />
            <p
              className={`text-[10px] font-semibold uppercase tracking-widest ${inverted || label === 'White' ? 'text-slate-500' : 'text-slate-400'}`}
            >
              {label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
