import type { PensionPot } from '@quro/shared';
import { Loader2, Sparkles, X } from 'lucide-react';
import {
  type JobPhase,
  type PensionImportModalStep,
} from '../../hooks/usePensionImportModalController';

type HeaderProps = {
  pot: PensionPot;
  step: PensionImportModalStep;
  jobPhase: JobPhase;
  onClose: () => void;
};

export function ImportHeader({ pot, step, jobPhase, onClose }: Readonly<HeaderProps>) {
  return (
    <div className="bg-gradient-to-r from-[#0a0f1e] to-[#1a1f3e] px-6 py-5 flex items-center justify-between flex-shrink-0">
      <div>
        <h2 className="font-bold text-white">Import Annual Statement</h2>
        <p className="text-xs text-amber-400 mt-0.5">
          {pot.emoji} {pot.name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {step === 'review' && (
          <span className="flex items-center gap-1.5 text-[10px] bg-white/10 text-slate-300 px-2.5 py-1 rounded-full">
            <Sparkles size={10} className="text-amber-400" />
            Parsed by AI
          </span>
        )}
        {step === 'queued' && (
          <span className="flex items-center gap-1.5 text-[10px] bg-white/10 text-slate-300 px-2.5 py-1 rounded-full">
            <Loader2
              size={10}
              className={jobPhase !== 'ready' ? 'animate-spin text-indigo-300' : 'text-emerald-400'}
            />
            {jobPhase === 'ready' ? 'Ready to review' : 'Running in background'}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title={step === 'queued' ? 'Close (job continues in background)' : 'Close'}
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
