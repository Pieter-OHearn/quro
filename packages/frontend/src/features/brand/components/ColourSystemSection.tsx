import type { BrandPaletteColor } from '../types';
import { SectionHeader } from './SectionHeader';

type ColourSystemSectionProps = {
  readonly palette: readonly BrandPaletteColor[];
};

export function ColourSystemSection({ palette }: Readonly<ColourSystemSectionProps>) {
  return (
    <section>
      <SectionHeader title="Colour System" sub="The five tones that define the Quro mark" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
        {palette.map(({ name, hex, role, border }) => (
          <div
            key={hex}
            className={`rounded-xl overflow-hidden shadow-sm ${border ? 'border border-slate-200' : ''}`}
          >
            <div className="h-16" style={{ backgroundColor: hex }} />
            <div className="bg-white px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-800">{name}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{hex}</p>
              <p className="text-[10px] text-slate-500 mt-1">{role}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
