import { QuroLogo } from '@/components/ui/QuroLogo';
import { SectionHeader } from './SectionHeader';

export function ClearspaceSection() {
  return (
    <section>
      <SectionHeader
        title="Clearspace"
        sub="Always leave at least ½× the mark's height as breathing room on all sides"
      />
      <div className="mt-6 bg-white rounded-2xl border border-dashed border-slate-300 p-12 flex items-center justify-center shadow-sm">
        <div className="relative">
          <div className="absolute -inset-8 border border-dashed border-indigo-300 rounded-2xl" />
          <div className="absolute -inset-8 flex items-center justify-center">
            <span className="absolute top-2 text-[9px] text-indigo-400 font-mono">½×</span>
            <span className="absolute bottom-2 text-[9px] text-indigo-400 font-mono">½×</span>
            <span className="absolute left-2 rotate-90 text-[9px] text-indigo-400 font-mono">
              ½×
            </span>
            <span className="absolute right-2 -rotate-90 text-[9px] text-indigo-400 font-mono">
              ½×
            </span>
          </div>
          <QuroLogo size={80} showBg />
        </div>
      </div>
    </section>
  );
}
